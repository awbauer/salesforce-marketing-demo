// Re-derives pass/fail and summaries for the published evaluation run under the current checks.
// It makes no model calls: it reads the stored per-check results, drops retired checks, and prices
// turns that predate cost tracking from their stored token counts (all input at the uncached rate).
// Quality scores and rubric criteria need the live tool evidence, so only a new run produces them.
import { readFileSync, writeFileSync } from "node:fs";
import { turnCost } from "../packages/evals/src/pricing.ts";
import { EVAL_CHECKS, EvalReportSchema } from "../packages/evals/src/report.ts";
import { buildMethodology } from "./lib/eval-methodology.mjs";
import { summarize, summarizeCost } from "./lib/eval-summary.mjs";

const REPORT_PATH = process.argv[2] ?? "apps/web/public/evals/latest.json";
const previous = JSON.parse(readFileSync(REPORT_PATH, "utf8"));
const trials = Object.fromEntries(
  previous.methodology.suites.map((suite) => [suite.id, suite.trials]),
);
const CHECK_NAMES = new Set(EVAL_CHECKS);

const results = previous.results.map((result) => {
  const checks = Object.fromEntries(
    EVAL_CHECKS.filter((check) => result.checks[check] !== undefined).map((check) => [
      check,
      result.checks[check],
    ]),
  );
  const passed = Object.values(checks).every(Boolean);
  const failedChecks = EVAL_CHECKS.filter((check) => checks[check] === false).join(", ");
  // Keep provider errors; replace failure text that only listed check names.
  const listedChecksOnly = (result.failure ?? "")
    .split(", ")
    .every((name) => name === "" || CHECK_NAMES.has(name) || name === "plainText");
  const { failure: _failure, ...rest } = result;
  const failure = passed ? undefined : listedChecksOnly ? failedChecks : result.failure;
  const cost =
    result.cost ??
    turnCost(result.model, {
      inputTokens: result.inputTokens,
      cachedInputTokens: result.cachedInputTokens ?? 0,
      outputTokens: result.outputTokens,
    });
  return { ...rest, cost, checks, passed, ...(failure ? { failure } : {}) };
});

const report = EvalReportSchema.parse({
  ...previous,
  productionModel: "@cf/openai/gpt-oss-20b" /* the eval baseline */,
  methodology: buildMethodology({
    trialsDemo: trials["demo-scenarios"],
    trialsRouting: trials["routing-pipeline"],
  }),
  summaries: summarize(results),
  results,
  // Judge and simulator spend cannot be re-derived, so a previous run's figures are kept.
  cost: summarizeCost(results, {
    judgeCosts: [{ usd: previous.cost?.judgesUsd ?? 0, neurons: 0 }],
    simulatorCost: { usd: previous.cost?.simulatorUsd ?? 0, neurons: 0 },
  }),
});
writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 1)}\n`);
const changed = results.filter((result, index) => result.passed !== previous.results[index].passed);
console.log(`Rescored ${results.length} turns; ${changed.length} changed outcome.`);
