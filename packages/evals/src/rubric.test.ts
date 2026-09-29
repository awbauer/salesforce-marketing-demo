import { describe, expect, it } from "vitest";
import { demoScenarios } from "./cases";
import {
  evaluateCriteria,
  isJudged,
  labeledField,
  scenarioRubrics,
  type ToolTrace,
} from "./rubric";

const mcp = (value: unknown) =>
  JSON.stringify({ content: [{ type: "text", text: JSON.stringify(value) }] });
const restaurantTrace: ToolTrace[] = [
  {
    name: "get_restaurant_profile",
    request: "",
    output: mcp({ menu: [{ item: "Tomato Basil Soup" }] }),
  },
  { name: "get_current_weather", request: "", output: mcp({ condition: "rain" }) },
  { name: "find_similar_past_pushes", request: "", output: "{}" },
];
const met = (caseId: string, answer: string, trace: ToolTrace[] = [], ungrounded: string[] = []) =>
  Object.fromEntries(
    evaluateCriteria(caseId, { answer, trace, ungrounded }).map((r) => [r.id, r.met]),
  );

describe("scenario rubrics", () => {
  it("has a rubric for every demo scenario", () => {
    for (const scenario of demoScenarios)
      expect(scenarioRubrics[scenario.id], scenario.id).toBeDefined();
  });

  it("judges only scenarios that are not policy refusals", () => {
    expect(isJudged("demo-restaurant-push")).toBe(true);
    expect(isJudged("demo-save")).toBe(false);
    expect(isJudged("demo-publish")).toBe(false);
  });

  it("reads labeled fields without markup", () => {
    expect(labeledField("**Headline:** Rain? Soup's on.\n**Body:** Warm up.", ["Headline"])).toBe(
      "Rain? Soup's on.",
    );
    expect(labeledField("no labels here", ["Headline"])).toBeUndefined();
  });

  it("passes a grounded brief and fails a generic one", () => {
    const trace: ToolTrace[] = [
      ...restaurantTrace.slice(0, 1).map((entry) => ({
        ...entry,
        output: mcp({ menu: [{ item: "Tomato Basil Soup" }], location: { city: "Los Angeles" } }),
      })),
      ...restaurantTrace.slice(1),
    ];
    const good = [
      "**Rainy-day comfort push**",
      "**Name:** Rainy Lunch Push",
      "**Description:** A lunch push for Los Angeles app users on a rainy afternoon, built on past rainy-day wins for Tomato Basil Soup.",
      "**Key Message:** Rain outside? Tomato Basil Soup is on at lunch.",
      "**Target Audience:** Los Angeles app users with push on",
      "**Primary Goal:** Drive lunch orders",
      "**Primary CTAs:** Order in the app",
      "**Primary KPI:** Order rate",
      "**Channel:** push. Nothing is saved yet.",
    ].join("\n");
    expect(Object.values(met("demo-restaurant-push", good, trace)).every(Boolean)).toBe(true);
    const generic = "**Name:** Promo\n**Key Message:** " + "Great deals for you. ".repeat(12);
    const result = met("demo-restaurant-push", generic, trace);
    expect(result["menu-item"]).toBe(false);
    expect(result.weather).toBe(false);
    expect(result["brief-fields"]).toBe(false);
    expect(result["key-message-length"]).toBe(false);
  });

  it("requires the weather condition the tool actually returned", () => {
    const answer = "**Key Message:** Sunny day, sunny bowl. Try our Tomato Basil Soup.";
    expect(met("demo-restaurant-push", answer, restaurantTrace).weather).toBe(false);
  });

  it("matches text that uses no-break spaces", () => {
    const trace: ToolTrace[] = [
      {
        name: "get_restaurant_profile",
        request: "",
        output: mcp({ menu: [], location: { city: "Los Angeles" } }),
      },
    ];
    const answer = "**Target Audience:** Los\u202fAngeles app users **Channel:** push";
    expect(met("demo-restaurant-push", answer, trace)["audience-city"]).toBe(true);
    expect(met("demo-readiness", "7 completed checks out of a total of 9")["progress"]).toBe(true);
    expect(
      met("demo-readiness", "| Total checks | 9 |\n| Completed checks | 7 |")["progress"],
    ).toBe(true);
  });

  it("checks summary figures against the fixture", () => {
    const right =
      "Sent to 12,400 with a 38.2% open rate, 6.7% click rate and 214 conversions, above the baseline.";
    expect(Object.values(met("demo-summary", right)).every(Boolean)).toBe(true);
    expect(met("demo-summary", "Open rate was 45%.")["open-rate"]).toBe(false);
  });

  it("requires every readiness blocker and a next step", () => {
    const trace: ToolTrace[] = [
      {
        name: "check_campaign_readiness",
        request: "",
        output: mcp({
          blockers: ["Hero image alt text is missing", "Commercial consent scope is not confirmed"],
        }),
      },
    ];
    const good =
      "7 of 9 checks are done. Add alt text to the hero image, and confirm the commercial consent scope.";
    const result = met("demo-readiness", good, trace);
    expect(result.progress && result.blockers && result["next-steps"]).toBe(true);
    expect(
      met("demo-readiness", "7 of 9 done; add alt text for the hero image.", trace).blockers,
    ).toBe(false);
  });

  it("flags ungrounded entities through the grounded criterion", () => {
    expect(
      met(
        "demo-buyer-group",
        "Marketing lead (engagement) and Operations manager (webinar).",
        [],
        ["Priya Raman"],
      ).grounded,
    ).toBe(false);
  });
});
