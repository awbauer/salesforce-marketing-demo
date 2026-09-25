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
});
