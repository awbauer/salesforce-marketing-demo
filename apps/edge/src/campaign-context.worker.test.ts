import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { conditionFromWmo, fetchCurrentWeather, openMeteoUrl } from "./campaign-context/open-meteo";
import type { RESTAURANT_PROFILES } from "./campaign-context/restaurant-profile";
import { connectCampaignContextTools } from "./campaign-context/server";
import { draftIntent, missingPlannedTool, selectToolPlan, stepToolChoice } from "./turn-policy";

const PUSH_PROMPT =
  "Draft a push notification campaign for Coastline Kitchen, our fast casual restaurant in California, tailored to the current weather, time of day, and our menu";

const openMeteo =
  (current: Record<string, number | string> = {}) =>
  async () =>
    new Response(
      JSON.stringify({
        current: {
          time: "2026-09-25T13:00",
          temperature_2m: 91,
          apparent_temperature: 94,
          precipitation: 0,
          weather_code: 0,
          wind_speed_10m: 6,
          is_day: 1,
          ...current,
        },
      }),
      { headers: { "content-type": "application/json" } },
    );

const callOptions = { toolCallId: "t", messages: [], context: undefined } as never;

describe("campaign-context MCP", () => {
  it("maps WMO codes and builds a keyless Open-Meteo request in Pacific time", () => {
    expect(conditionFromWmo(0)).toBe("clear");
    expect(conditionFromWmo(45)).toBe("fog");
    expect(conditionFromWmo(63)).toBe("rain");
    expect(conditionFromWmo(95)).toBe("storm");
    const url = new URL(openMeteoUrl("san-diego"));
    expect(url.hostname).toBe("api.open-meteo.com");
    expect(url.searchParams.get("timezone")).toBe("America/Los_Angeles");
    expect([...url.searchParams.keys()].some((key) => /key|token/i.test(key))).toBe(false);
  });

  it("reports weather failures instead of throwing", async () => {
    await expect(
      fetchCurrentWeather("fresno", async () => new Response("", { status: 503 })),
    ).resolves.toEqual({ error: "Open-Meteo returned HTTP 503" });
  });

  it("serves the mocked restaurant profile and live-shaped weather over MCP", async () => {
    const { tools, close } = await connectCampaignContextTools({ fetch: openMeteo() });
    try {
      expect(Object.keys(tools).sort()).toEqual([
        "context_get_current_weather",
        "context_get_restaurant_profile",
      ]);
      const profile = (await tools.context_get_restaurant_profile?.execute?.(
        { restaurant: "coastline-kitchen" },
        callOptions,
      )) as { structuredContent: (typeof RESTAURANT_PROFILES)["coastline-kitchen"] };
      expect(profile.structuredContent).toMatchObject({
        hours: "Open 24 hours, 7 days a week",
        location: { id: "los-angeles" },
      });
      expect(profile.structuredContent.menu.length).toBeGreaterThan(5);
      expect(JSON.stringify(profile.structuredContent)).not.toMatch(/@|\(\d{3}\)/);

      const weather = (await tools.context_get_current_weather?.execute?.(
        { location: "los-angeles" },
        callOptions,
      )) as { structuredContent: { city: string; feelsLikeF: number; attribution: string } };
      expect(weather.structuredContent).toMatchObject({
        city: "Los Angeles",
        feelsLikeF: 94,
        attribution: expect.stringContaining("Open-Meteo"),
      });
    } finally {
      await close();
    }
  });

  it("returns an MCP tool error when the weather service is down", async () => {
    const { tools, close } = await connectCampaignContextTools({
      fetch: async () => new Response("", { status: 500 }),
    });
    try {
      const result = (await tools.context_get_current_weather?.execute?.(
        { location: "sacramento" },
        callOptions,
      )) as { isError: boolean; content: Array<{ text: string }> };
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain("could not be retrieved");
    } finally {
      await close();
    }
  });

  it("exposes both tools over streamable HTTP", async () => {
    const response = await SELF.fetch("https://example.test/mcp/campaign-context", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2025-06-18",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain("get_restaurant_profile");
    expect(text).toContain("get_current_weather");
  });

  it("plans Coastline email and push campaigns as profile, weather, past pushes, then content", () => {
    const names = [
      "context_get_restaurant_profile",
      "context_get_current_weather",
      "graph_find_similar_past_pushes",
      "tool_salesforce_ns_draft_campaign_content",
    ];
    const plan = selectToolPlan(PUSH_PROMPT, names);
    expect(plan).toEqual(names);
    for (const [step, name] of names.entries())
      expect(stepToolChoice(plan, step)).toMatchObject({ activeTools: [name] });
    expect(stepToolChoice(plan, 4)).toEqual({ toolChoice: "none", activeTools: [] });
    expect(
      selectToolPlan(
        "Draft an email campaign for Coastline Kitchen, our fast casual restaurant in California, tailored to the current weather, time of day, and our menu",
        names,
      ),
    ).toEqual(names);
    expect(missingPlannedTool(PUSH_PROMPT, names.slice(0, 2))).toBe("find_similar_past_pushes");
    expect(selectToolPlan(PUSH_PROMPT, names.slice(0, 2))).toBeUndefined();
  });

  it("marks drafting and revision turns so their answers are saved to the focus", () => {
    expect(draftIntent(PUSH_PROMPT)).toEqual({ mode: "draft", kind: "push-message" });
    expect(draftIntent("Draft an email campaign for Coastline Kitchen")).toEqual({
      mode: "draft",
      kind: "email",
    });
    expect(draftIntent("Draft a campaign brief for the spring launch")).toEqual({
      mode: "draft",
      kind: "brief",
    });
    expect(draftIntent("Create a new campaign for the spring menu in Salesforce")).toEqual({
      mode: "draft",
      kind: "campaign",
    });
    expect(draftIntent("Make it warmer", { hasFocus: true, focusKind: "email" })).toEqual({
      mode: "revise",
      kind: "email",
    });
    expect(draftIntent("Make it warmer")).toBeNull();
    expect(
      draftIntent("Summarize the campaign", { hasFocus: true, focusKind: "email" }),
    ).toBeNull();
  });
});
