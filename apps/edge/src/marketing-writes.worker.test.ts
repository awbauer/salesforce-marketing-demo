import { runInDurableObject, SELF } from "cloudflare:test";
import { emptyWorkingSet, type FocusItem, type WorkingSet } from "@northstar/contracts";
import { describe, expect, it } from "vitest";
import { applyFocusUpdate, type FocusInput } from "./focus";
import {
  agentRequest,
  agentToolInput,
  briefFocusFromAgent,
  briefFromFocus,
  idsFromAgentReply,
  localAgentWrite,
  type MarketingReadBack,
  parseMarketingReadBack,
  parsePermissionReport,
  pinBriefToRefinement,
  planMarketingWrite,
  sameBrief,
} from "./marketing-writes";
import { agentStubFor } from "./worker.test-helpers";

const at = new Date("2026-09-26T18:00:00Z");
// The Campaign Creation agent's Draft a Campaign Brief reply, as observed in the proof org.
const AGENT_BRIEF = [
  "Here is a draft campaign brief for Coastline Kitchen's rainy-day lunch email:",
  "",
  "Name: Rainy Day Lunch Email Campaign",
  "Description: Increase engagement with app users during rainy weather.",
  "Key Message: Enjoy a warm and comforting meal on a rainy day with Spicy Tortilla Soup.",
  "Target Audience: App users in Los Angeles who order at lunch.",
  "Primary Goal: Drive app orders for Spicy Tortilla Soup during rainy weather.",
  'Primary Calls-to-Action: "Order Now" and "View Menu" buttons within the email.',
  "Primary KPI: Increase in app orders for Spicy Tortilla Soup.",
  "Agent Guardrails: Comply with email marketing regulations.",
  "Priority: Focus on users who ordered similar items.",
  "",
  "Would you like to see a campaign preview based on this brief?",
].join("\n");

const focusFrom = (input: FocusInput): FocusItem =>
  applyFocusUpdate(emptyWorkingSet(), input, at).focus as FocusItem;

describe("Marketing Cloud writes through the Campaign Creation agent", () => {
  it("reads the agent's drafted brief into the focus, field for field", () => {
    const input = briefFocusFromAgent(AGENT_BRIEF, "Drafted by the Campaign Creation agent");
    expect(input).toMatchObject({ kind: "brief", title: "Rainy Day Lunch Email Campaign" });
    expect(input?.summary).toBe("Increase engagement with app users during rainy weather.");
    expect(input?.fields.map((field) => field.label)).toEqual([
      "Key Message",
      "Target Audience",
      "Primary Goal",
      "Primary CTAs",
      "Primary KPI",
      "Agent Guardrails",
      "Priority",
    ]);
    expect(briefFocusFromAgent("I need more details about the campaign.", "x")).toBeNull();
  });

  it("plans the brief save, then the campaign, then nothing once the campaign exists", () => {
    const focus = focusFrom(briefFocusFromAgent(AGENT_BRIEF, "Drafted") as FocusInput);
    const save = planMarketingWrite(focus);
    expect(save).toMatchObject({
      action: "save-marketing-brief",
      recordId: "new",
      write: {
        kind: "brief",
        brief: {
          name: "Rainy Day Lunch Email Campaign",
          targetAudience: "App users in Los Angeles who order at lunch.",
          primaryCtas: '"Order Now" and "View Menu" buttons within the email.',
        },
      },
    });
    const saved: FocusItem = {
      ...focus,
      saved: { objectType: "Brief", recordId: "21yjV0000002NIHQA2", version: 1, preview: [] },
    };
    expect(planMarketingWrite(saved)).toMatchObject({
      action: "create-marketing-campaign",
      recordId: "21yjV0000002NIHQA2",
      write: { kind: "campaign", briefId: "21yjV0000002NIHQA2" },
    });
    expect(
      planMarketingWrite({
        ...saved,
        saved: {
          ...(saved.saved as NonNullable<FocusItem["saved"]>),
          campaign: { id: "701jV00000C75VVQAZ", name: "Rainy Day", stage: null, flow: null },
        },
      }),
    ).toBeNull();
    // A revision after saving becomes a new brief, as Marketing Cloud's Save Campaign Brief does.
    expect(planMarketingWrite({ ...saved, current: 2 })?.action).toBe("save-marketing-brief");
  });

  it("turns any other draft into a brief, keeping a requested push channel as a guardrail", () => {
    const brief = briefFromFocus(
      focusFrom({
        kind: "push-message",
        title: "Rainy-day comfort",
        summary: "Lunch push for Los Angeles app users.",
        fields: [
          { label: "Headline", value: "Rain outside? Soup's on." },
          { label: "Audience", value: "Los Angeles app users" },
          { label: "Channel", value: "Mobile app push" },
        ],
        changeNote: "First draft",
      }),
    );
    expect(brief).toMatchObject({
      name: "Rainy-day comfort",
      keyMessage: "Rain outside? Soup's on.",
      targetAudience: "Los Angeles app users",
      agentGuardrails: "Requested channel: Mobile app push.",
    });
  });

  it("asks the agent in one self-contained request and finds the ids it replies with", () => {
    const save = agentRequest({
      kind: "brief",
      brief: {
        name: "Coastline Late-Night Tacos",
        description: "Late-night email.",
        keyMessage: "Tacos until 2 a.m.",
        targetAudience: "Night owls",
      },
    });
    expect(save).toContain("Save it exactly as written with Save Campaign Brief");
    expect(save).toContain("Do not create or save the campaign yet");
    expect(save).toContain("Name: Coastline Late-Night Tacos");
    const create = agentRequest({
      kind: "campaign",
      briefId: "21yjV0000002NJtQAM",
      briefName: "Coastline Late-Night Tacos",
    });
    expect(create).toContain("brief 21yjV0000002NJtQAM");
    expect(create).toContain("Create Campaign, then save it with Save Campaign");
    expect(create).toContain("Do not activate");
    expect(
      idsFromAgentReply("The brief is saved.\n\nBrief ID: 21yjV0000002NLVQA2\n\nCampaign preview:"),
    ).toEqual({ briefId: "21yjV0000002NLVQA2", campaignId: undefined });
    expect(idsFromAgentReply("Saved campaign 701jV00000C76xpQAB.").campaignId).toBe(
      "701jV00000C76xpQAB",
    );
    expect(
      agentToolInput(
        { inputSchema: { jsonSchema: { properties: { userMessage: { type: "string" } } } } },
        "hi",
      ),
    ).toEqual({ userMessage: "hi" });
    expect(agentToolInput({}, "hi")).toEqual({ message: "hi" });
  });

  it("parses the Salesforce read-back of the brief, preview steps, campaign, and flow", () => {
    const readBack = parseMarketingReadBack({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            found: true,
            readBack: true,
            recordsJson: JSON.stringify({
              brief: { id: "21yjV0000002NIHQA2", name: "Rainy Day", keyMessage: "Soup" },
              steps: [
                {
                  stepNumber: 1,
                  stepType: "Message",
                  channel: "EMAIL",
                  waitNumber: 0,
                  waitUnit: "Days",
                  content:
                    '{"subjectLine":"Warm Up","preheader":"Rainy day","paragraph":"Order now."}',
                },
              ],
              campaign: {
                id: "701jV00000C75VVQAZ",
                name: "Rainy Day Comfort",
                stage: "In Planning",
              },
              flow: {
                apiName: "flow_701jV00000C75VVQAZ_1",
                label: "Rainy Day Comfort Campaign Flow",
                versionId: "301jV00000C73yNQAR",
                active: false,
              },
            }),
          }),
        },
      ],
    });
    expect(readBack?.brief?.id).toBe("21yjV0000002NIHQA2");
    expect(readBack?.steps[0]).toMatchObject({
      channel: "EMAIL",
      subject: "Warm Up",
      preheader: "Rainy day",
      body: "Order now.",
    });
    expect(readBack?.campaign).toMatchObject({
      id: "701jV00000C75VVQAZ",
      flow: { label: "Rainy Day Comfort Campaign Flow", active: false },
    });
    expect(parseMarketingReadBack({ content: [{ type: "text", text: "not json" }] })).toBeNull();
  });

  it("reads Salesforce's permission report from an MCP tool result", () => {
    const report = parsePermissionReport(
      {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              allowed: true,
              userName: "Avery Evaluator",
              checksJson: JSON.stringify([
                { label: "Create Brief", passed: true, detail: "Allowed." },
              ]),
            }),
          },
        ],
      },
      at,
    );
    expect(report).toMatchObject({ source: "salesforce", user: "Avery Evaluator", allowed: true });
    expect(parsePermissionReport({ content: [] }, at)).toBeNull();
  });

  it("saves the brief, then creates the campaign and flow, locally end to end", async () => {
    await SELF.fetch("https://example.test/agent/working-set/reset", { method: "POST" });
    const stub = await agentStubFor();
    await runInDurableObject(stub, (instance) => {
      (instance as unknown as { updateFocus: (input: FocusInput) => unknown }).updateFocus(
        briefFocusFromAgent(AGENT_BRIEF, "Drafted by the Campaign Creation agent") as FocusInput,
      );
    });
    const prepare = (action: string) =>
      SELF.fetch("https://example.test/agent/confirmations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
    const execute = () =>
      SELF.fetch("https://example.test/agent/confirmations/execute", { method: "POST" });
    const workingSet = () =>
      runInDurableObject(
        stub,
        (instance) =>
          (instance as unknown as { state: { workingSet: WorkingSet } }).state.workingSet,
      );

    // Creating the campaign before the brief is saved isn't offered.
    expect((await prepare("create-marketing-campaign")).status).toBe(400);
    const briefCard = await prepare("save-marketing-brief");
    expect(briefCard.status).toBe(201);
    await expect(briefCard.json()).resolves.toMatchObject({
      write: { kind: "brief", brief: { name: "Rainy Day Lunch Email Campaign" } },
      permissions: {
        checks: expect.arrayContaining([expect.objectContaining({ label: "Create Brief" })]),
      },
    });
    const savedBrief = await execute();
    expect(savedBrief.status).toBe(200);
    const briefResult = (await savedBrief.json()) as {
      result: { agent: { name: string; kind: string }; actions: Array<{ label: string }> };
    };
    expect(briefResult.result.agent).toMatchObject({
      name: "Northstar_Campaign_Creation",
      kind: "Marketing Cloud Next Campaign Creation agent",
    });
    expect(briefResult.result.actions.map((item) => item.label)).toEqual([
      "Marketing Cloud: Save Campaign Brief",
      "Marketing Cloud: Draft a Campaign Preview",
    ]);
    let set = await workingSet();
    expect(set.focus?.saved).toMatchObject({ objectType: "Brief", version: 1 });
    expect(set.focus?.saved?.preview).toHaveLength(2);
    expect(set.records.find((record) => record.objectType === "Brief")).toMatchObject({
      relation: "created",
      title: "Rainy Day Lunch Email Campaign",
    });

    const campaignCard = await prepare("create-marketing-campaign");
    expect(campaignCard.status).toBe(201);
    expect((await execute()).status).toBe(200);
    set = await workingSet();
    expect(set.focus?.saved?.campaign).toMatchObject({
      stage: "In Planning",
      flow: { label: "Rainy Day Lunch Email Campaign Campaign Flow", active: false },
    });
    expect(set.records.map((record) => record.objectType)).toEqual(
      expect.arrayContaining(["Brief", "Campaign", "Flow"]),
    );
    // Once the campaign exists there is nothing more to save.
    expect((await prepare("create-marketing-campaign")).status).toBe(400);
  });

  it("links a brief or campaign an earlier attempt created instead of saving it twice", async () => {
    await SELF.fetch("https://example.test/agent/working-set/reset", { method: "POST" });
    const stub = await agentStubFor();
    type Agent = {
      updateFocus: (input: FocusInput) => unknown;
      localMarketing: Map<string, MarketingReadBack>;
      callMarketingAgent: (...args: unknown[]) => Promise<unknown>;
      marketingAttemptKey: (write: unknown) => Promise<string>;
      rememberAttempt: (key: string) => void;
    };
    const brief = briefFocusFromAgent(AGENT_BRIEF, "Drafted") as FocusInput;
    const plannedBrief = planMarketingWrite(focusFrom(brief));
    if (plannedBrief?.write.kind !== "brief") throw new Error("expected a brief save");
    expect(
      sameBrief(plannedBrief.write.brief, {
        ...plannedBrief.write.brief,
        name: " rainy day LUNCH email campaign ",
      }),
    ).toBe(true);
    expect(
      sameBrief(plannedBrief.write.brief, { ...plannedBrief.write.brief, keyMessage: "Other" }),
    ).toBe(false);
    const prepare = (action: string) =>
      SELF.fetch("https://example.test/agent/confirmations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
    const execute = async () =>
      (await (
        await SELF.fetch("https://example.test/agent/confirmations/execute", { method: "POST" })
      ).json()) as {
        result?: { found?: string; brief?: { id: string }; campaign?: { id: string } };
        error?: { message: string };
      };
    const count = () =>
      runInDurableObject(stub, (instance) => (instance as unknown as Agent).localMarketing.size);

    // Another chat saved a brief with the same name and key message: it is not linked.
    await runInDurableObject(stub, (instance) => {
      const agent = instance as unknown as Agent;
      agent.localMarketing.clear();
      localAgentWrite(plannedBrief.write, agent.localMarketing);
      agent.updateFocus(brief);
    });
    expect((await prepare("save-marketing-brief")).status).toBe(201);
    const fresh = await execute();
    expect(fresh.result?.found).toBeUndefined();
    expect(fresh.result?.brief?.id).toBe("21y000000000002");
    expect(await count()).toBe(2);

    // This chat's own earlier attempt timed out after the agent saved: it is linked.
    await runInDurableObject(stub, async (instance) => {
      const agent = instance as unknown as Agent;
      agent.localMarketing.clear();
      localAgentWrite(plannedBrief.write, agent.localMarketing);
      agent.rememberAttempt(await agent.marketingAttemptKey(plannedBrief.write));
      agent.updateFocus(brief);
    });
    expect((await prepare("save-marketing-brief")).status).toBe(201);
    const reused = await execute();
    expect(reused.result).toMatchObject({ found: "reused", brief: { id: "21y000000000001" } });
    expect(await count()).toBe(1);

    // The campaign already exists on the brief: linked, not created again.
    await runInDurableObject(stub, (instance) => {
      const agent = instance as unknown as Agent;
      localAgentWrite(
        { kind: "campaign", briefId: "21y000000000001", briefName: "x" },
        agent.localMarketing,
      );
    });
    expect((await prepare("create-marketing-campaign")).status).toBe(201);
    expect((await execute()).result).toMatchObject({
      found: "reused",
      campaign: { id: "701000000000001" },
    });
  });

  it("recovers a save that timed out after the agent saved, and asks to retry when it didn't", async () => {
    await SELF.fetch("https://example.test/agent/working-set/reset", { method: "POST" });
    const stub = await agentStubFor();
    type Agent = {
      updateFocus: (input: FocusInput) => unknown;
      localMarketing: Map<string, MarketingReadBack>;
      callMarketingAgent: (...args: unknown[]) => Promise<unknown>;
    };
    const prepareAndExecute = async (saveBeforeFailing: boolean, keyMessage: string) => {
      await runInDurableObject(stub, (instance) => {
        const agent = instance as unknown as Agent;
        agent.localMarketing.clear();
        const input = briefFocusFromAgent(
          AGENT_BRIEF.replace(/Key Message: .*/, `Key Message: ${keyMessage}`),
          "Drafted",
        ) as FocusInput;
        agent.updateFocus(input);
        agent.callMarketingAgent = async (_current, write) => {
          if (saveBeforeFailing) localAgentWrite(write as never, agent.localMarketing);
          throw new Error("The operation timed out");
        };
      });
      await SELF.fetch("https://example.test/agent/confirmations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "save-marketing-brief" }),
      });
      return SELF.fetch("https://example.test/agent/confirmations/execute", { method: "POST" });
    };
    const recovered = await prepareAndExecute(true, "Soup first.");
    expect(recovered.status).toBe(200);
    await expect(recovered.json()).resolves.toMatchObject({ result: { found: "recovered" } });

    const failed = await prepareAndExecute(false, "Soup second.");
    expect(failed.status).toBe(502);
    const body = (await failed.json()) as { error: { message: string } };
    expect(body.error.message).toContain("may still be saving");
    expect(body.error.message).toContain("links what it finds instead of saving twice");
  });

  it("names the saved brief in every refinement request, whatever the model wrote", async () => {
    const seen: unknown[] = [];
    const record = { execute: async (input: unknown) => seen.push(input) };
    const tools = pinBriefToRefinement(
      { tool_salesforce_ns_refine_campaign_preview: record, graph_get_graph_overview: record },
      "21yjV0000002NIHQA2",
    );
    const refine = tools.tool_salesforce_ns_refine_campaign_preview as typeof record;
    await refine.execute({ message: "Make the second email shorter" });
    await refine.execute({ message: "On brief 21yjV0000002NIHQA2, shorten email 2" });
    await (tools.graph_get_graph_overview as typeof record).execute({});
    expect(seen).toEqual([
      {
        message:
          "Refine the campaign preview on brief 21yjV0000002NIHQA2: Make the second email shorter",
      },
      { message: "On brief 21yjV0000002NIHQA2, shorten email 2" },
      {},
    ]);
    // Without a saved brief there is nothing to pin.
    const unpinned = { tool_salesforce_ns_refine_campaign_preview: record };
    expect(pinBriefToRefinement(unpinned, undefined)).toBe(unpinned);
  });
});
