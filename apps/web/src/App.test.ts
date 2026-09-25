import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import { executionTrace, readableToolName, sanitizedPayload } from "./App";

describe("technical trace hardening", () => {
  it("does not manufacture a tool-free trace for an empty assistant record", () => {
    const message: UIMessage = { id: "empty", role: "assistant", parts: [] };
    expect(executionTrace(message)).toEqual([]);
  });

  it("does not echo malformed provider tool names", () => {
    expect(readableToolName("draft_campaign_content<|Channel|>Analysis")).toBe(
      "Unrecognized tool request",
    );
    expect(readableToolName("salesforce_draft_campaign_content")).toBe("Draft Campaign Content");
  });

  it("redacts credentials embedded inside string payloads", () => {
    expect(sanitizedPayload("Authorization: Bearer abc.def.secret-value")).toBe(
      "Authorization: Bearer [redacted]",
    );
    expect(sanitizedPayload("eyJabcdefghijkl.abcdefghijklmnop.abcdefgh-secret")).toBe(
      "[redacted token]",
    );
  });

  it("appends a response event instead of rewriting the completed tool call", () => {
    const message = {
      id: "tool-result",
      role: "assistant",
      parts: [
        {
          type: "dynamic-tool",
          toolName: "salesforce_draft_campaign_content",
          toolCallId: "call-1",
          state: "output-available",
          input: { message: "Draft a campaign" },
          output: { isError: false, structuredContent: { message: "Draft complete" } },
        },
      ],
    } as UIMessage;

    expect(executionTrace(message).map(({ label, state }) => ({ label, state }))).toEqual([
      { label: "Northstar orchestrator", state: "active" },
      { label: "Salesforce agent call · Draft Campaign Content", state: "complete" },
      { label: "Salesforce agent response · Draft Campaign Content", state: "complete" },
    ]);
  });
});
