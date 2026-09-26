import { runInDurableObject, SELF } from "cloudflare:test";
import { type Confirmation, emptyWorkingSet, type WorkingSet } from "@northstar/contracts";
import { describe, expect, it } from "vitest";
import { applyFocusUpdate, type FocusInput } from "./focus";
import { parsePermissionReport, planFocusWrite } from "./record-writes";
import { agentStubFor, CATALOG_CAMPAIGN_ID, openCatalogCampaign } from "./worker.test-helpers";
import { addCreatedRecord } from "./working-set";

const at = new Date("2026-09-26T18:00:00Z");
const push = (overrides: Partial<FocusInput> = {}): FocusInput => ({
  kind: "push-message",
  title: "Rainy-day comfort",
  summary: "Lunch push for Los Angeles app users.",
  fields: [
    { label: "Headline", value: "Rain outside? Soup's on." },
    { label: "Body", value: "Warm up with Spicy Tortilla Soup." },
    { label: "Send time", value: "11:15 a.m." },
    { label: "Campaign", value: "Coastline Weather Moments" },
    { label: "Brand", value: "Coastline Kitchen" },
  ],
  changeNote: "First draft",
  ...overrides,
});
const withOpenCampaign = (): WorkingSet =>
  addCreatedRecord(
    emptyWorkingSet(),
    {
      system: "salesforce",
      objectType: "Campaign",
      recordId: CATALOG_CAMPAIGN_ID,
      title: "Fall Loyalty Reactivation",
    },
    "summarize_campaign",
    at,
  );

describe("record writes planned from the focus", () => {
  it("creates a message on the campaign the draft names, or the open one", () => {
    const named = applyFocusUpdate(withOpenCampaign(), push(), at);
    const plan = planFocusWrite(named.focus as NonNullable<WorkingSet["focus"]>, named);
    expect(plan.action).toBe("save-message");
    expect(plan.recordId).toBe("new");
    expect(plan.write).toMatchObject({
      objectType: "Northstar_Message__c",
      newCampaignName: "Coastline Weather Moments",
      brand: "Coastline Kitchen",
      channel: "Push",
      subject: "Rain outside? Soup's on.",
      body: "Warm up with Spicy Tortilla Soup.",
      sendTime: "11:15 a.m.",
    });
    expect(plan.summary).toContain('on a new campaign "Coastline Weather Moments"');

    const email = applyFocusUpdate(
      withOpenCampaign(),
      push({ kind: "email", fields: [{ label: "Subject", value: "We saved your spot" }] }),
      at,
    );
    const onOpen = planFocusWrite(email.focus as NonNullable<WorkingSet["focus"]>, email);
    expect(onOpen.recordId).toBe(CATALOG_CAMPAIGN_ID);
    expect(onOpen.write).toMatchObject({ campaignId: CATALOG_CAMPAIGN_ID, channel: "Email" });
  });

  it("updates the saved record for later versions, and plans campaigns as campaigns", () => {
    const set = applyFocusUpdate(withOpenCampaign(), push(), at);
    const saved: WorkingSet = {
      ...set,
      focus: {
        ...(set.focus as NonNullable<WorkingSet["focus"]>),
        saved: { objectType: "Northstar_Message__c", recordId: "a0C000000000001", version: 1 },
      },
    };
    const next = applyFocusUpdate(saved, push({ changeNote: "Warmer" }), at);
    const plan = planFocusWrite(next.focus as NonNullable<WorkingSet["focus"]>, next);
    expect(plan.recordId).toBe("a0C000000000001");
    expect(plan.write.recordId).toBe("a0C000000000001");
    expect(plan.summary.startsWith("Update")).toBe(true);

    const campaign = applyFocusUpdate(
      emptyWorkingSet(),
      push({ kind: "campaign", title: "Spring Trail Series" }),
      at,
    );
    expect(
      planFocusWrite(campaign.focus as NonNullable<WorkingSet["focus"]>, campaign),
    ).toMatchObject({
      action: "save-campaign",
      recordId: "new",
      write: { objectType: "Campaign", title: "Spring Trail Series" },
    });
  });

  it("reads Salesforce's permission report", () => {
    const report = parsePermissionReport(
      {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              allowed: false,
              userName: "Avery Evaluator",
              checksJson: JSON.stringify([
                { label: "Create Northstar Message", passed: true, detail: "Allowed." },
                { label: "Marketing User", passed: false, detail: "Needed." },
              ]),
            }),
          },
        ],
      },
      at,
    );
    expect(report).toMatchObject({ source: "salesforce", user: "Avery Evaluator", allowed: false });
    expect(report?.checks).toHaveLength(2);
    expect(parsePermissionReport({ content: [] }, at)).toBeNull();
  });
});

describe("confirmed record writes", () => {
  it("checks permissions, creates the message and its campaign, then updates the same record", async () => {
    await SELF.fetch("https://example.test/agent/working-set/reset", { method: "POST" });
    const stub = await openCatalogCampaign();
    const updateFocus = (input: FocusInput) =>
      runInDurableObject(stub, (instance) => {
        (instance as unknown as { updateFocus: (input: FocusInput) => unknown }).updateFocus(input);
      });
    const prepare = () =>
      SELF.fetch("https://example.test/agent/confirmations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "save-message" }),
      });
    const execute = () =>
      SELF.fetch("https://example.test/agent/confirmations/execute", { method: "POST" });
    const workingSet = async () =>
      runInDurableObject(
        await agentStubFor(),
        (instance) =>
          (instance as unknown as { state: { workingSet: WorkingSet } }).state.workingSet,
      );

    await updateFocus(push());
    const first = await prepare();
    expect(first.status).toBe(201);
    const confirmation = (await first.json()) as Confirmation;
    expect(confirmation.recordId).toBe("new");
    expect(confirmation.write?.newCampaignName).toBe("Coastline Weather Moments");
    expect(confirmation.permissions).toMatchObject({ source: "local-fixture", allowed: true });
    expect(confirmation.permissions?.checks.map((check) => check.label)).toEqual(
      expect.arrayContaining(["Create Northstar Message", "Create Campaign", "Marketing User"]),
    );
    expect((await execute()).status).toBe(200);
    let set = await workingSet();
    expect(set.focus?.saved).toMatchObject({ objectType: "Northstar_Message__c", version: 1 });
    expect(set.records.slice(0, 2).map((record) => [record.objectType, record.relation])).toEqual([
      ["Northstar_Message__c", "created"],
      ["Campaign", "created"],
    ]);

    await updateFocus(push({ changeNote: "Warmer" }));
    const second = (await (await prepare()).json()) as Confirmation;
    expect(second.write?.recordId).toBe("a0C000000000001");
    expect(second.summary.startsWith("Update")).toBe(true);
    expect((await execute()).status).toBe(200);
    set = await workingSet();
    expect(set.focus?.saved?.version).toBe(2);
    expect(
      set.records.find((record) => record.objectType === "Northstar_Message__c")?.relation,
    ).toBe("updated");
  });

  it("refuses a record save that doesn't match the draft", async () => {
    await SELF.fetch("https://example.test/agent/working-set/reset", { method: "POST" });
    const response = await SELF.fetch("https://example.test/agent/confirmations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "save-campaign" }),
    });
    expect(response.status).toBe(400);
  });
});
