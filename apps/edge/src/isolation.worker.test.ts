import { env } from "cloudflare:test";
import { PROOF_DEFAULTS } from "@northstar/contracts";
import { getAgentByName } from "agents";
import { describe, expect, it } from "vitest";
import { deriveAgentKey } from "./auth";

const CAMPAIGN_ID = "701jV000004GglIQAS";
const PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  ),
  (character) => character.charCodeAt(0),
);

/** Addresses a user's agent exactly as the Worker router does after Access authentication. */
async function agentFor(subject: string) {
  const name = await deriveAgentKey(
    {
      subject,
      email: `${subject}@northstar.example`,
      role: "evaluator",
      tenantId: "northstar-pot",
    },
    PROOF_DEFAULTS.workspaceId,
  );
  const stub = await getAgentByName(env.MarketingOrchestrator, name, {
    props: { principalSubject: subject, workspaceId: PROOF_DEFAULTS.workspaceId },
  });
  return (path: string, init?: RequestInit) =>
    stub.fetch(new Request(`https://example.test/agent/${path}`, init));
}

async function seedDraftFor(subject: string) {
  const imageId = crypto.randomUUID();
  await env.APP_DB.exec(
    "CREATE TABLE IF NOT EXISTS campaign_image_drafts (image_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, principal_subject TEXT NOT NULL, campaign_id TEXT NOT NULL, channel TEXT NOT NULL, prompt_summary TEXT NOT NULL, prompt_version TEXT NOT NULL, model_id TEXT NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL, content_hash TEXT NOT NULL, r2_key TEXT NOT NULL UNIQUE, lifecycle TEXT NOT NULL, seed INTEGER, created_at TEXT NOT NULL, expires_at TEXT NOT NULL)",
  );
  const r2Key = `drafts/northstar-demo/${subject}/${imageId}.png`;
  await env.CAMPAIGN_ASSETS.put(r2Key, PNG);
  const digest = await crypto.subtle.digest("SHA-256", PNG);
  const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  await env.APP_DB.prepare(
    `INSERT INTO campaign_image_drafts VALUES (?, 'northstar-demo', ?, ?, 'email', 'Private concept',
      'campaign-image-v1', '@cf/black-forest-labs/flux-2-klein-4b', 1024, 1024, ?, ?, 'draft',
      NULL, ?, ?)`,
  )
    .bind(
      imageId,
      subject,
      CAMPAIGN_ID,
      hash,
      r2Key,
      new Date().toISOString(),
      new Date(Date.now() + 86_400_000).toISOString(),
    )
    .run();
  return imageId;
}

describe("cross-user isolation", () => {
  it("never exposes another user's image drafts through list, serve, reject, or attach", async () => {
    const alice = await agentFor("evaluator-alice");
    const bobImage = await seedDraftFor("evaluator-bob");

    const listed = (await (await alice(`images?campaignId=${CAMPAIGN_ID}`)).json()) as {
      images: Array<{ id: string }>;
    };
    expect(listed.images.map((image) => image.id)).not.toContain(bobImage);
    expect((await alice(`images/${bobImage}`)).status).toBe(404);
    expect((await alice(`images/${bobImage}/reject`, { method: "POST" })).status).toBe(409);
    const attach = await alice("confirmations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "attach-generated-image",
        recordId: CAMPAIGN_ID,
        imageId: bobImage,
      }),
    });
    expect(attach.status).toBe(400);

    const bob = await agentFor("evaluator-bob");
    expect((await bob(`images/${bobImage}`)).status).toBe(200);
  });

  it("keeps pending confirmations, turn history, and audit exports per user", async () => {
    const alice = await agentFor("evaluator-carol");
    const bob = await agentFor("evaluator-dave");
    const preflight = await alice("confirmations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "create-review-task",
        recordId: CAMPAIGN_ID,
        summary: "Create a review task for the current blockers.",
      }),
    });
    expect(preflight.status).toBe(201);

    expect((await bob("confirmations/execute", { method: "POST" })).status).toBe(409);
    await expect((await bob("turns")).json()).resolves.toMatchObject({ turns: [] });

    const bobAudit = (await (await bob("audit/export")).json()) as {
      confirmations: Array<{ confirmation_id: string }>;
    };
    const aliceAudit = (await (await alice("audit/export")).json()) as {
      confirmations: Array<{ action: string; status: string }>;
    };
    expect(aliceAudit.confirmations).toContainEqual(
      expect.objectContaining({ action: "create-review-task", status: "pending" }),
    );
    expect(bobAudit.confirmations).toEqual([]);
  });
});
