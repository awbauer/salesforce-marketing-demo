import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { openCatalogCampaign } from "./worker.test-helpers";

const CAMPAIGN_ID = "701jV000004GglIQAS";
// A valid 1x1 PNG; fictional test content only.
const PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  ),
  (character) => character.charCodeAt(0),
);

async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function seedDraft(imageId: string, campaignId = CAMPAIGN_ID) {
  await env.APP_DB.exec(
    "CREATE TABLE IF NOT EXISTS campaign_image_drafts (image_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, principal_subject TEXT NOT NULL, campaign_id TEXT NOT NULL, channel TEXT NOT NULL, prompt_summary TEXT NOT NULL, prompt_version TEXT NOT NULL, model_id TEXT NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL, content_hash TEXT NOT NULL, r2_key TEXT NOT NULL UNIQUE, lifecycle TEXT NOT NULL, seed INTEGER, created_at TEXT NOT NULL, expires_at TEXT NOT NULL)",
  );
  const r2Key = `drafts/northstar-demo/test/${imageId}.png`;
  await env.CAMPAIGN_ASSETS.put(r2Key, PNG);
  const contentHash = await sha256(PNG);
  await env.APP_DB.prepare(
    `INSERT INTO campaign_image_drafts VALUES (?, 'northstar-demo', 'local-evaluator', ?, 'email',
      'A quiet trailhead at golden hour', 'campaign-image-v1', '@cf/black-forest-labs/flux-2-klein-4b', 1024, 1024, ?, ?,
      'draft', NULL, ?, ?)`,
  )
    .bind(
      imageId,
      campaignId,
      contentHash,
      r2Key,
      new Date().toISOString(),
      new Date(Date.now() + 86_400_000).toISOString(),
    )
    .run();
  return { r2Key, contentHash };
}

function preflight(imageId: string, recordId = CAMPAIGN_ID) {
  return SELF.fetch("https://example.test/agent/confirmations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "attach-generated-image", recordId, imageId }),
  });
}

const execute = () =>
  SELF.fetch("https://example.test/agent/confirmations/execute", { method: "POST" });

describe("confirmed campaign image attachment", () => {
  beforeEach(() => openCatalogCampaign());
  it("binds the confirmation to one draft and its hash, attaches it, and blocks reuse", async () => {
    const imageId = crypto.randomUUID();
    const { contentHash } = await seedDraft(imageId);

    const pending = await preflight(imageId);
    expect(pending.status).toBe(201);
    const confirmation = (await pending.json()) as {
      action: string;
      imageId: string;
      contentHash: string;
      summary: string;
      idempotencyKey: string;
    };
    expect(confirmation).toMatchObject({ action: "attach-generated-image", imageId, contentHash });
    expect(confirmation.summary).toContain("A quiet trailhead at golden hour");

    const executed = await execute();
    expect(executed.status).toBe(200);
    await expect(executed.json()).resolves.toMatchObject({
      result: {
        source: "local-fixture",
        recordId: "069000000000001",
        campaignId: CAMPAIGN_ID,
        contentHash,
        title: "Northstar email campaign image",
        readBack: true,
      },
    });
    const draft = await env.APP_DB.prepare(
      "SELECT lifecycle FROM campaign_image_drafts WHERE image_id = ?",
    )
      .bind(imageId)
      .first<{ lifecycle: string }>();
    expect(draft?.lifecycle).toBe("attached");
    const audit = await env.APP_DB.prepare(
      "SELECT status, source_record_id FROM confirmation_audit WHERE idempotency_key = ?",
    )
      .bind(confirmation.idempotencyKey)
      .first();
    expect(audit).toEqual({ status: "executed", source_record_id: "069000000000001" });

    expect((await preflight(imageId)).status).toBe(400);
  });

  it("refuses an image whose stored bytes changed after confirmation", async () => {
    const imageId = crypto.randomUUID();
    const { r2Key } = await seedDraft(imageId);
    expect((await preflight(imageId)).status).toBe(201);
    await env.CAMPAIGN_ASSETS.put(r2Key, new Uint8Array([...PNG, 0]));
    const executed = await execute();
    expect(executed.status).toBe(409);
    await expect(executed.json()).resolves.toMatchObject({
      error: { message: expect.stringContaining("no longer matches") },
    });
  });

  it("rejects unknown images and drafts generated for another campaign", async () => {
    expect((await preflight(crypto.randomUUID())).status).toBe(400);
    const imageId = crypto.randomUUID();
    await seedDraft(imageId, "701jV000009ZZZZQAS");
    expect((await preflight(imageId)).status).toBe(400);
  });

  it("lists this user's variants and rejects a draft so it can no longer be attached", async () => {
    const first = crypto.randomUUID();
    const second = crypto.randomUUID();
    await seedDraft(first);
    await seedDraft(second);
    const listed = await SELF.fetch(`https://example.test/agent/images?campaignId=${CAMPAIGN_ID}`);
    const { images } = (await listed.json()) as {
      images: Array<{ id: string; lifecycle: string }>;
    };
    expect(images.map((image) => image.id)).toEqual(expect.arrayContaining([first, second]));

    const rejected = await SELF.fetch(`https://example.test/agent/images/${first}/reject`, {
      method: "POST",
    });
    expect(rejected.status).toBe(200);
    const after = (await (
      await SELF.fetch(`https://example.test/agent/images?campaignId=${CAMPAIGN_ID}`)
    ).json()) as { images: Array<{ id: string; lifecycle: string }> };
    expect(after.images.find((image) => image.id === first)?.lifecycle).toBe("rejected");
    expect((await preflight(first)).status).toBe(400);
    expect(
      (await SELF.fetch(`https://example.test/agent/images/${first}/reject`, { method: "POST" }))
        .status,
    ).toBe(409);
  });

  it("does not list variants for an invalid campaign", async () => {
    const response = await SELF.fetch("https://example.test/agent/images?campaignId=bad");
    await expect(response.json()).resolves.toEqual({ images: [] });
  });
});
