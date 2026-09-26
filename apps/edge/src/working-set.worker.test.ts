import { runInDurableObject, SELF } from "cloudflare:test";
import { emptyWorkingSet, type WorkingSet } from "@northstar/contracts";
import { describe, expect, it } from "vitest";
import { connectCampaignContextTools } from "./campaign-context/server";
import { connectKnowledgeGraphTools, knowledgeGraphBackend } from "./knowledge-graph/server";
import { agentStubFor, CATALOG_CAMPAIGN_ID, openCatalogCampaign } from "./worker.test-helpers";
import {
  baseToolName,
  ingestToolResult,
  openCampaign,
  salesforceRecordsIn,
  workingSetPrompt,
} from "./working-set";

const at = new Date("2026-09-26T18:00:00Z");
const text = (value: string) => ({ content: [{ type: "text", text: value }] });

describe("working set", () => {
  it("resolves prefixed tool keys to orchestrator tools", () => {
    expect(baseToolName("context_get_current_weather")).toBe("get_current_weather");
    expect(baseToolName("graph_find_similar_past_pushes")).toBe("find_similar_past_pushes");
    expect(
      baseToolName("tool_salesforce_northstar-marketing-salesforce_check_campaign_readiness"),
    ).toBe("check_campaign_readiness");
    expect(baseToolName("something_else")).toBeNull();
  });

  it("turns real context and graph tool results into cards and non-Salesforce records", async () => {
    const context = await connectCampaignContextTools({
      fetch: async () =>
        Response.json({
          current: {
            time: "2026-09-26T11:00",
            temperature_2m: 71.4,
            apparent_temperature: 70.2,
            precipitation: 0,
            weather_code: 0,
            wind_speed_10m: 6.1,
            is_day: 1,
          },
        }),
    });
    const graph = await connectKnowledgeGraphTools(knowledgeGraphBackend({}));
    const call = async (tools: Record<string, unknown>, key: string, input: unknown) =>
      (tools[key] as { execute: (input: unknown, options: unknown) => Promise<unknown> }).execute(
        input,
        { toolCallId: "t", messages: [] },
      );
    let set: WorkingSet = emptyWorkingSet();
    const steps: Array<[Record<string, unknown>, string, unknown]> = [
      [context.tools, "context_get_restaurant_profile", { restaurant: "coastline-kitchen" }],
      [context.tools, "context_get_current_weather", { location: "los-angeles" }],
      [
        graph.tools,
        "graph_find_similar_past_pushes",
        { location: "los-angeles", daypart: "lunch", condition: "clear" },
      ],
    ];
    for (const [tools, key, input] of steps)
      set = ingestToolResult(set, {
        toolName: key,
        input,
        output: await call(tools, key, input),
        at,
      });
    await context.close();
    await graph.close();

    expect(set.startedAt).toBe(at.toISOString());
    expect(set.cards.map((card) => card.kind)).toEqual(["graph", "weather", "restaurant"]);
    const weather = set.cards.find((card) => card.kind === "weather");
    expect(weather?.title).toBe("Clear in Los Angeles");
    expect(weather?.metric).toBe("71°F");
    expect(weather?.source.system).toBe("open-meteo");
    expect(set.cards[0]?.summary).toMatch(/past sends in los-angeles, lunch, clear/);
    expect(set.records).toEqual([
      expect.objectContaining({
        system: "restaurant-data",
        systemLabel: "Restaurant data",
        objectType: "Restaurant",
        recordId: "coastline-kitchen",
        title: "Coastline Kitchen",
        relation: "read",
      }),
    ]);
  });

  it("opens Salesforce records named by id or catalog name, and skips failed results", () => {
    expect(salesforceRecordsIn(`Summarize ${CATALOG_CAMPAIGN_ID}`)[0]).toMatchObject({
      objectType: "Campaign",
      title: "Fall Loyalty Reactivation",
    });
    expect(salesforceRecordsIn("How is the fall loyalty reactivation doing?")).toHaveLength(1);
    expect(salesforceRecordsIn("Draft a push for Coastline Kitchen")).toEqual([]);

    const readiness = ingestToolResult(emptyWorkingSet(), {
      toolName: "tool_salesforce_x_check_campaign_readiness",
      input: { message: `Check ${CATALOG_CAMPAIGN_ID}` },
      output: text("7 of 9 checks pass.\n- Add image alt text\n- Confirm consent scope"),
      at,
    });
    expect(openCampaign(readiness)?.recordId).toBe(CATALOG_CAMPAIGN_ID);
    expect(readiness.cards[0]).toMatchObject({
      kind: "readiness",
      title: "Fall Loyalty Reactivation",
      details: ["Add image alt text", "Confirm consent scope"],
      presentation: { kind: "hxl" },
    });
    const failed = ingestToolResult(emptyWorkingSet(), {
      toolName: "tool_salesforce_x_summarize_campaign",
      input: {},
      output: { semanticStatus: "error", message: "failed" },
      at,
    });
    expect(failed).toEqual(emptyWorkingSet());
  });

  it("tells the model what is open and keeps the catalog separate", () => {
    const empty = workingSetPrompt(emptyWorkingSet());
    expect(empty).toContain("No records are open in this chat yet.");
    expect(empty).toMatch(
      /Catalog .*act on one only when the user asks for it by name or id.*Fall Loyalty Reactivation/,
    );
    const opened = ingestToolResult(emptyWorkingSet(), {
      toolName: "tool_salesforce_x_summarize_campaign",
      input: { message: `Summarize ${CATALOG_CAMPAIGN_ID}` },
      output: text("Engagement is holding."),
      at,
    });
    const prompt = workingSetPrompt(opened);
    expect(prompt).toContain(
      "Records open in this chat: Fall Loyalty Reactivation (Salesforce Campaign",
    );
    expect(prompt).not.toContain("Catalog");
  });

  it("resets on request, refuses writes without an open campaign, and records created writes", async () => {
    const reset = await SELF.fetch("https://example.test/agent/working-set/reset", {
      method: "POST",
    });
    expect(await reset.json()).toEqual(emptyWorkingSet());
    const refused = await SELF.fetch("https://example.test/agent/confirmations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "create-review-task",
        recordId: CATALOG_CAMPAIGN_ID,
        summary: "Create a review task.",
      }),
    });
    expect(refused.status).toBe(409);

    await openCatalogCampaign();
    const preflight = await SELF.fetch("https://example.test/agent/confirmations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "create-review-task",
        recordId: CATALOG_CAMPAIGN_ID,
        summary: "Create a review task.",
      }),
    });
    expect(preflight.status).toBe(201);
    const execute = await SELF.fetch("https://example.test/agent/confirmations/execute", {
      method: "POST",
    });
    expect(execute.status).toBe(200);
    const state = await runInDurableObject(
      await agentStubFor(),
      (instance) => (instance as unknown as { state: { workingSet: WorkingSet } }).state.workingSet,
    );
    expect(state.records.map((record) => [record.objectType, record.relation])).toEqual([
      ["Task", "created"],
      ["Campaign", "read"],
    ]);
  });
});

describe("readable Salesforce results", () => {
  it("never shows raw JSON on a card", () => {
    const confirm = ingestToolResult(emptyWorkingSet(), {
      toolName: "tool_salesforce_x_draft_campaign_content",
      input: { message: `Draft an email for ${CATALOG_CAMPAIGN_ID}` },
      output: text(
        JSON.stringify({
          messages: [
            {
              type: "Confirm",
              confirm: [
                {
                  type: "copilotActionInput/CreateOrRefineSectionWithContent_abc",
                  inputs: { contentKey: "fall-email", contentTypeFqn: "email", userInput: "Draft" },
                },
              ],
            },
          ],
        }),
      ),
      at,
    });
    const card = confirm.cards[0];
    expect(card?.summary).toBe(
      "The Salesforce agent is asking to confirm before it continues: create or refine section with content (email). It did not return a draft.",
    );
    expect(JSON.stringify(card?.details)).not.toContain("{");

    const spoken = ingestToolResult(emptyWorkingSet(), {
      toolName: "tool_salesforce_x_summarize_campaign",
      input: {},
      output: text(
        JSON.stringify({ messages: [{ type: "Inform", message: "Engagement is holding." }] }),
      ),
      at,
    });
    expect(spoken.cards[0]?.summary).toBe("Engagement is holding.");
  });
});
