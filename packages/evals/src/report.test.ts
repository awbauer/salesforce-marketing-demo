import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { demoScenarios, routingCases } from "./cases";
import { EVAL_SUITES, EvalReportSchema } from "./report";

const PUBLISHED_REPORT = "apps/web/public/evals/latest.json";

describe("evaluation report contract", () => {
  it("keeps every published result consistent with its summaries and cases", () => {
    if (!existsSync(PUBLISHED_REPORT)) return;
    const report = EvalReportSchema.parse(JSON.parse(readFileSync(PUBLISHED_REPORT, "utf8")));
    const knownCases = new Set<string>([...demoScenarios, ...routingCases].map((test) => test.id));
    for (const result of report.results) {
      expect(knownCases.has(result.caseId), result.caseId).toBe(true);
      expect(result.passed).toBe(Object.values(result.checks).every(Boolean));
    }
    for (const summary of report.summaries) {
      const group = report.results.filter(
        (result) => result.model === summary.model && result.suite === summary.suite,
      );
      expect(summary.total).toBe(group.length);
      expect(summary.passed).toBe(group.filter((result) => result.passed).length);
    }
    expect(report.methodology.suites.map((suite) => suite.id)).toEqual([...EVAL_SUITES]);
  });

  it("gives every demo scenario and routing case a unique id", () => {
    const ids = [...demoScenarios, ...routingCases].map((test) => test.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
