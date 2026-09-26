// Re-derives pass/fail and summaries for the published evaluation run under the current checks.
// It makes no model calls: it only reads the stored per-check results and drops retired checks.
import { readFileSync, writeFileSync } from "node:fs";
import { PROOF_DEFAULTS } from "../packages/contracts/src/index.ts";
import { EVAL_CHECKS, EvalReportSchema } from "../packages/evals/src/report.ts";
import { buildMethodology } from "./lib/eval-methodology.mjs";
import { summarize } from "./lib/eval-summary.mjs";

const REPORT_PATH = process.argv[2] ?? "apps/web/public/evals/latest.json";
const previous = JSON.parse(readFileSync(REPORT_PATH, "utf8"));
const trials = Object.fromEntries(
  previous.methodology.suites.map((suite) => [suite.id, suite.trials]),
);
const CHECK_NAMES = new Set(EVAL_CHECKS);

const results = previous.results.map((result) => {
  const checks = Object.fromEntries(EVAL_CHECKS.map((check) => [check, result.checks[check]]));
  const passed = Object.values(checks).every(Boolean);
  const failedChecks = EVAL_CHECKS.filter((check) => !checks[check]).join(", ");
  // Keep provider errors; replace failure text that only listed check names.
  const listedChecksOnly = (result.failure ?? "")
    .split(", ")
    .every((name) => name === "" || CHECK_NAMES.has(name) || name === "plainText");
  const { failure: _failure, ...rest } = result;
  const failure = passed ? undefined : listedChecksOnly ? failedChecks : result.failure;
  return { ...rest, checks, passed, ...(failure ? { failure } : {}) };
});

const report = EvalReportSchema.parse({
  ...previous,
  productionModel: PROOF_DEFAULTS.orchestratorModel,
  methodology: buildMethodology({
    trialsDemo: trials["demo-scenarios"],
    trialsRouting: trials["routing-pipeline"],
  }),
  summaries: summarize(results),
  results,
});
writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 1)}\n`);
const changed = results.filter((result, index) => result.passed !== previous.results[index].passed);
console.log(`Rescored ${results.length} turns; ${changed.length} changed outcome.`);
