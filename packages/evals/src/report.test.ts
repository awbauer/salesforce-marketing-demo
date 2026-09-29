import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { demoScenarios, routingCases } from "./cases";
import { EVAL_SUITES, EvalReportSchema } from "./report";
import { scenarioRubrics } from "./rubric";

const PUBLISHED_REPORT = "apps/web/public/evals/latest.json";

describe("evaluation report contract", () => {
  it("keeps every published result consistent with its summaries and cases", () => {
    if (!existsSync(PUBLISHED_REPORT)) return;
    const report = EvalReportSchema.parse(JSON.parse(readFileSync(PUBLISHED_REPORT, "utf8")));
    const knownCases = new Set<string>([...demoScenarios, ...routingCases].map((test) => test.id));
    for (const result of report.results) {
      expect(knownCases.has(result.caseId), result.caseId).toBe(true);
      expect(result.passed).toBe(Object.values(result.checks).every((value) => value !== false));
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

  it("keeps cost and quality consistent with the results they summarize", () => {
    if (!existsSync(PUBLISHED_REPORT)) return;
    const report = EvalReportSchema.parse(JSON.parse(readFileSync(PUBLISHED_REPORT, "utf8")));
    for (const summary of report.summaries) {
      const group = report.results.filter(
        (result) => result.model === summary.model && result.suite === summary.suite,
      );
      const spent = group.reduce((sum, result) => sum + (result.cost?.usd ?? 0), 0);
      if (summary.costUsd !== undefined) expect(summary.costUsd).toBeCloseTo(spent, 8);
    }
    for (const result of report.results) {
      if (result.quality && !result.quality.judgeError)
        expect(Object.keys(scenarioRubrics[result.caseId]?.weights ?? {}).length).toBeGreaterThan(
          0,
        );
    }
    if (report.cost) {
      const models = report.results.reduce((sum, result) => sum + (result.cost?.usd ?? 0), 0);
      expect(report.cost.contestantsUsd).toBeCloseTo(models, 8);
      expect(report.cost.totalUsd).toBeCloseTo(
        report.cost.contestantsUsd + report.cost.judgesUsd + report.cost.simulatorUsd,
        8,
      );
    }
  });

  it("gives every demo scenario a rubric with criteria", () => {
    for (const scenario of demoScenarios) {
      expect(scenarioRubrics[scenario.id]?.criteria.length, scenario.id).toBeGreaterThan(0);
    }
  });

  it("gives every demo scenario and routing case a unique id", () => {
    const ids = [...demoScenarios, ...routingCases].map((test) => test.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
