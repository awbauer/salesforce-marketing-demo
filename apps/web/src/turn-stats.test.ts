import { describe, expect, it } from "vitest";
import { toolCallCount, tokensLabel, toolCallsLabel, turnStats } from "./turn-stats";

describe("turn stats", () => {
  it("reads seconds, tokens, and tool calls together", () => {
    expect(turnStats("9.0s", { tokens: 1204, toolCalls: 2 })).toBe(
      "9.0s · 1,204 tokens · 2 tool calls",
    );
    expect(turnStats("0.1s", { tokens: 1, toolCalls: 1 })).toBe("0.1s · 1 token · 1 tool call");
    expect(turnStats("0.1s", { tokens: 0, toolCalls: 0 })).toBe("0.1s · 0 tokens · 0 tool calls");
  });

  it("counts the tools in a plan", () => {
    expect(toolCallCount(null)).toBe(0);
    expect(toolCallCount("build_aum_account_plan")).toBe(1);
    expect(toolCallCount("get_fed_announcements → match_news_to_approved_content")).toBe(2);
    expect(tokensLabel(12_345)).toBe("12,345 tokens");
    expect(toolCallsLabel(1.4)).toBe("1.4 tool calls");
  });
});
