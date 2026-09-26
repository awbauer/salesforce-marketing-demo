import { runInDurableObject, SELF } from "cloudflare:test";
import { emptyWorkingSet, type WorkingSet } from "@northstar/contracts";
import { describe, expect, it } from "vitest";
import { applyFocusUpdate, type FocusInput, focusBriefText, focusPrompt } from "./focus";
import { agentStubFor, CATALOG_CAMPAIGN_ID, openCatalogCampaign } from "./worker.test-helpers";
import { workingSetPrompt } from "./working-set";

const at = new Date("2026-09-26T18:00:00Z");
const draft = (overrides: Partial<FocusInput> = {}): FocusInput => ({
  kind: "push-message",
  title: "Rainy-day comfort",
  summary: "Lunch push for Los Angeles app users.",
  fields: [
    { label: "Headline", value: "Rain outside? Soup's on." },
    { label: "Send time", value: "11:15 a.m." },
  ],
  changeNote: "First draft",
  ...overrides,
});

describe("workspace focus", () => {
  it("keeps every version of the same draft and starts over for a different kind", () => {
    const withCard: WorkingSet = {
      ...emptyWorkingSet(),
      cards: [
        {
          id: "weather:los-angeles",
          kind: "weather",
          eyebrow: "Weather",
          title: "Rain in Los Angeles",
          summary: "",
          state: "ready",
          source: { system: "open-meteo", label: "Open-Meteo", freshness: "now", status: "ready" },
          details: [],
        },
      ],
    };
    const first = applyFocusUpdate(withCard, draft(), at, () => "focus-1");
    expect(first.focus).toMatchObject({ id: "focus-1", kind: "push-message", current: 1 });
    expect(first.focus?.versions[0]?.basedOn).toEqual(["weather:los-angeles"]);
    const second = applyFocusUpdate(
      first,
      draft({
        fields: [{ label: "Headline", value: "Warm soup is waiting." }],
        changeNote: "Warmer",
      }),
      at,
    );
    expect(second.focus?.id).toBe("focus-1");
    expect(second.focus?.current).toBe(2);
    expect(second.focus?.versions.map((version) => version.changeNote)).toEqual([
      "First draft",
      "Warmer",
    ]);
    const brief = applyFocusUpdate(
      second,
      draft({ kind: "brief", title: "Q4 brief" }),
      at,
      () => "focus-2",
    );
    expect(brief.focus).toMatchObject({ id: "focus-2", kind: "brief", current: 1 });
  });

  it("describes the focus as the draft revisions and saves apply to", () => {
    const set = applyFocusUpdate(emptyWorkingSet(), draft(), at);
    expect(focusPrompt(set.focus)).toContain(
      'Current focus (the draft the user is working on; revisions, references to the draft, and saves apply to it): Push message "Rainy-day comfort" (version 1).',
    );
    expect(workingSetPrompt(set).startsWith("Current focus")).toBe(true);
    expect(focusPrompt(null)).toBe("");
  });

  it("writes the focus as brief text within the confirmation limit", () => {
    const set = applyFocusUpdate(
      emptyWorkingSet(),
      draft({ fields: [{ label: "Body", value: "x".repeat(1000) }] }),
      at,
    );
    const text = focusBriefText(set.focus as NonNullable<WorkingSet["focus"]>);
    expect(text.startsWith("Push message: Rainy-day comfort (v1)")).toBe(true);
    expect(text.length).toBeLessThanOrEqual(500);
  });

  it("binds a brief save to the focus version and marks the campaign updated", async () => {
    await SELF.fetch("https://example.test/agent/working-set/reset", { method: "POST" });
    const stub = await openCatalogCampaign();
    await runInDurableObject(stub, (instance) => {
      (instance as unknown as { updateFocus: (input: FocusInput) => unknown }).updateFocus(draft());
    });
    const preflight = await SELF.fetch("https://example.test/agent/confirmations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "save-draft-campaign",
        recordId: CATALOG_CAMPAIGN_ID,
        summary: "client text is ignored when a focus exists",
      }),
    });
    expect(preflight.status).toBe(201);
    const confirmation = (await preflight.json()) as {
      summary: string;
      focus: { version: number; title: string };
    };
    expect(confirmation.focus).toMatchObject({ version: 1, title: "Rainy-day comfort" });
    expect(confirmation.summary).toContain("Headline: Rain outside? Soup's on.");
    expect(confirmation.summary).not.toContain("client text");
    const execute = await SELF.fetch("https://example.test/agent/confirmations/execute", {
      method: "POST",
    });
    expect(execute.status).toBe(200);
    const workingSet = await runInDurableObject(
      await agentStubFor(),
      (instance) => (instance as unknown as { state: { workingSet: WorkingSet } }).state.workingSet,
    );
    expect(
      workingSet.records.find((record) => record.recordId === CATALOG_CAMPAIGN_ID),
    ).toMatchObject({
      relation: "updated",
      title: "Fall Loyalty Reactivation",
    });
  });
});
