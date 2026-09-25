import { SELF } from "cloudflare:test";
import { TurnRecordSchema } from "@northstar/contracts";
import { describe, expect, it } from "vitest";
import { buildTurnRecord, describeInterpretation, redactForHistory } from "./turn-history";

describe("turn history", () => {
  it("records interpretation, tool inputs and outputs, outcome, and token usage", () => {
    const record = buildTurnRecord({
      utterance: "Summarize the sample campaign",
      model: "@cf/openai/gpt-oss-120b",
      route: "model",
      requiredTool: "tool_salesforce_ns_summarize_campaign",
      result: {
        outcome: "completed",
        reasoning: "Call the summary tool, then explain.",
        answer: "VERO Phase 1 Launch is in progress.",
        trace: {
          startedAt: 1_000,
          events: [
            { kind: "turn-start", at: 1_000, model: "m", toolCount: 1 },
            { kind: "step-start", at: 1_010, step: 0 },
            {
              kind: "step-finish",
              at: 2_000,
              step: 0,
              finishReason: "tool-calls",
              inputTokens: 900,
              outputTokens: 40,
            },
            { kind: "step-start", at: 2_010, step: 1 },
            {
              kind: "step-finish",
              at: 3_000,
              step: 1,
              finishReason: "stop",
              inputTokens: 1_100,
              outputTokens: 120,
            },
            { kind: "turn-finish", at: 3_500, outcome: "completed" },
          ],
        },
        toolCalls: [
          {
            toolCallId: "c1",
            toolName: "tool_salesforce_ns_summarize_campaign",
            status: "ok",
            input: { message: "Summarize", confirmationId: "v1.secret" },
            output: { summary: "Contact jo@example.invalid", token: "abc" },
            startedAt: 1_500,
            endedAt: 1_900,
          },
        ],
      },
    });
    expect(TurnRecordSchema.parse(record)).toEqual(record);
    expect(record).toMatchObject({
      durationMs: 2_500,
      steps: 2,
      inputTokens: 2_000,
      outputTokens: 160,
      fallback: false,
      outcome: "completed",
      interpretation: expect.stringContaining("summarize campaign intent"),
    });
    expect(record.tools[0]).toMatchObject({
      durationMs: 400,
      input: { message: "Summarize", confirmationId: "[redacted]" },
      output: { summary: "Contact [redacted email]", token: "[redacted]" },
    });
  });

  it("explains policy and model routes in plain language", () => {
    expect(describeInterpretation("unsupported")).toContain("Refused without calling the model");
    expect(describeInterpretation("model")).toContain("the model chose");
  });

  it("bounds oversized tool payloads", () => {
    expect(String(redactForHistory("x".repeat(5_000))).length).toBeLessThan(1_010);
  });

  it("lists this user's turns with the retention period", async () => {
    const response = await SELF.fetch("https://example.test/agent/turns");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ retentionDays: 14, turns: [] });
  });
});
