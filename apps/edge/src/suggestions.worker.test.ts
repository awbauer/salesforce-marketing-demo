import { runInDurableObject, SELF } from "cloudflare:test";
import type { Confirmation, SuggestedAction } from "@northstar/contracts";
import { describe, expect, it } from "vitest";
import type { FocusInput } from "./focus";
import { agentStubFor, CATALOG_CAMPAIGN_ID, openCatalogCampaign } from "./worker.test-helpers";

type Agent = {
  state: { suggestions: SuggestedAction[] };
  ingestToolResult: (name: string, input: unknown, output: unknown) => void;
  updateFocus: (input: FocusInput) => unknown;
  suggestFocusSave: () => void;
};

const suggestions = async () =>
  runInDurableObject(
    await agentStubFor(),
    (instance) => (instance as unknown as Agent).state.suggestions,
  );

describe("action cards in the chat", () => {
  it("suggests a review after a readiness check, and accepting it prepares the confirmation", async () => {
    await SELF.fetch("https://example.test/agent/working-set/reset", { method: "POST" });
    const stub = await openCatalogCampaign();
    await runInDurableObject(stub, (instance) => {
      (instance as unknown as Agent).ingestToolResult(
        "tool_salesforce_x_check_campaign_readiness",
        { message: `Check ${CATALOG_CAMPAIGN_ID}` },
        { content: [{ type: "text", text: "7 of 9 checks pass.\n- Add alt text" }] },
      );
    });
    const [review] = await suggestions();
    expect(review).toMatchObject({
      action: "create-review-task",
      title: "Request a review of Fall Loyalty Reactivation?",
      cta: "Prepare review request",
    });
    const accepted = await SELF.fetch(
      `https://example.test/agent/suggestions/${review?.id}/accept`,
      { method: "POST" },
    );
    expect(accepted.status).toBe(201);
    const confirmation = (await accepted.json()) as Confirmation;
    expect(confirmation).toMatchObject({
      action: "create-review-task",
      recordId: CATALOG_CAMPAIGN_ID,
    });
    expect(confirmation.permissions?.allowed).toBe(true);
    expect(await suggestions()).toEqual([]);
    await SELF.fetch("https://example.test/agent/confirmations/deny", { method: "POST" });
  });

  it("suggests saving a draft, can be dismissed, and clears with a new chat", async () => {
    await SELF.fetch("https://example.test/agent/working-set/reset", { method: "POST" });
    const stub = await openCatalogCampaign();
    await runInDurableObject(stub, (instance) => {
      const agent = instance as unknown as Agent;
      agent.updateFocus({
        kind: "email",
        title: "Rainy lunch",
        summary: "",
        fields: [{ label: "Subject line", value: "Soup's on." }],
        changeNote: "First draft",
      });
      agent.suggestFocusSave();
    });
    const [save] = await suggestions();
    expect(save).toMatchObject({
      action: "save-focus",
      title: "Save “Rainy lunch” in Salesforce?",
    });
    const dismissed = await SELF.fetch(
      `https://example.test/agent/suggestions/${save?.id}/dismiss`,
      { method: "POST" },
    );
    expect(dismissed.status).toBe(200);
    expect(await suggestions()).toEqual([]);

    await runInDurableObject(stub, (instance) => {
      (instance as unknown as Agent).suggestFocusSave();
    });
    expect(await suggestions()).toHaveLength(1);
    await SELF.fetch("https://example.test/agent/working-set/reset", { method: "POST" });
    expect(await suggestions()).toEqual([]);
  });
});
