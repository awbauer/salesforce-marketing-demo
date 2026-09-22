import { describe, expect, it } from "vitest";
import catalog from "./tool-catalog.json";
import { initialOrchestratorState, OrchestratorStateSchema, PROOF_DEFAULTS } from "./index";

describe("proof contracts", () => {
  it("accepts the typed initial state", () => {
    expect(OrchestratorStateSchema.parse(initialOrchestratorState).tiles).toHaveLength(3);
  });
  it("keeps the proof's forbidden write classes out", () => {
    expect(PROOF_DEFAULTS.allowedWrites).not.toContain("publish");
    expect(PROOF_DEFAULTS.allowedWrites).not.toContain("delete");
  });
  it("keeps every Salesforce write outside autonomous model execution", () => {
    const writes = catalog.tools.filter((tool) => tool.riskClass === "write");
    expect(writes).toHaveLength(2);
    expect(writes.every((tool) => tool.autonomous === false)).toBe(true);
    expect(writes.map((tool) => tool.allowedWrite)).toEqual([
      "save-draft-campaign",
      "create-review-task",
    ]);
  });
});
