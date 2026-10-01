// Pre-run cost projection: turns the planned model calls into dollars before any call is made.
import {
  FREE_NEURONS_PER_DAY,
  formatUsd,
  NEURON_USD,
  turnCost,
} from "../../packages/evals/src/pricing.ts";
import { JUDGES, judgesFor, scenarioDimensions } from "./eval-judge.mjs";
import { SIMULATED_TOOLS, SIMULATOR_MODEL } from "./eval-simulated-agent.mjs";
import { requestsPerMinute } from "./eval-throttle.mjs";

// Fallback per-turn token use by suite when a model has no history: measured on the published run.
const FALLBACK = {
  "demo-scenarios": { input: 1100, output: 450 },
  "routing-pipeline": { input: 1000, output: 350 },
  "routing-model-only": { input: 1000, output: 350 },
};
// Extra multi-step turns (restaurant plans call four tools) read more input and write more output.
const MULTI_STEP = { input: 3.2, output: 1.8 };
// Measured with reasoning_effort low: GLM-5.3 about 200 output tokens, DeepSeek V4 Pro about 700.
const JUDGE_TURN = { input: 3400, output: 500 };
const SIMULATOR_TURN = { input: 500, output: 550 };

/** Mean tokens per model turn for a model and suite, from a previous report or the fallback. */
function tokensPer(previous, model, suite) {
  const rows = (previous?.results ?? []).filter(
    (result) => result.model === model && result.suite === suite && result.route === "model",
  );
  if (rows.length < 3) return FALLBACK[suite];
  const mean = (key) => rows.reduce((sum, row) => sum + row[key], 0) / rows.length;
  return { input: mean("inputTokens"), output: mean("outputTokens") };
}

/**
 * @param plan  { models: [{id,label,family}], suites: [{id, cases, trials}] }
 * @param previous the last published report, or undefined
 */
export function estimateRun(plan, previous) {
  const rows = [];
  let judgeUsd = 0;
  // Requests per model, to project wall time under each model's rate limit.
  const calls = new Map();
  const addCalls = (id, count) => calls.set(id, (calls.get(id) ?? 0) + count);
  let simulatorCalls = 0;
  for (const model of plan.models) {
    let usd = 0;
    let turns = 0;
    for (const suite of plan.suites) {
      const per = tokensPer(previous, model.id, suite.id);
      for (const testCase of suite.cases) {
        // Policy-routed prompts (save, publish) never reach a model; the case's expected value says so.
        if (["confirmation_required", "unsupported"].includes(testCase.expected)) continue;
        const multi = testCase.expected.includes(" → ") ? MULTI_STEP : { input: 1, output: 1 };
        const cost = turnCost(model.id, {
          inputTokens: per.input * multi.input,
          outputTokens: per.output * multi.output,
        });
        usd += cost.usd * suite.trials;
        turns += suite.trials;
        addCalls(model.id, suite.trials * (testCase.expected.includes(" → ") ? 5 : 2));
        if (suite.id === "demo-scenarios" && scenarioDimensions(testCase.id).length) {
          for (const judge of judgesFor(model.family)) {
            addCalls(judge.id, suite.trials);
            judgeUsd +=
              turnCost(judge.id, {
                inputTokens: JUDGE_TURN.input,
                outputTokens: JUDGE_TURN.output,
              }).usd * suite.trials;
          }
          if (SIMULATED_TOOLS.length) simulatorCalls += 1;
        }
      }
    }
    rows.push({ label: model.label, turns, usd });
  }
  // The simulator caches identical requests, so it is counted once per scenario, not per trial.
  const simulatorUsd = turnCost(SIMULATOR_MODEL, {
    inputTokens: SIMULATOR_TURN.input * simulatorCalls,
    outputTokens: SIMULATOR_TURN.output * simulatorCalls,
  }).usd;
  const contestantsUsd = rows.reduce((sum, row) => sum + row.usd, 0);
  const totalUsd = contestantsUsd + judgeUsd + simulatorUsd;
  // Minutes each model needs at its rate limit; models run in parallel, so the slowest sets the pace.
  const minutes = [...calls].map(([id, count]) => ({
    id,
    count,
    minutes: count / requestsPerMinute(id),
  }));
  return { rows, contestantsUsd, judgesUsd: judgeUsd, simulatorUsd, totalUsd, minutes };
}

export function formatEstimate(estimate) {
  const lines = ["Estimated Workers AI cost (Cloudflare list prices):"];
  for (const row of estimate.rows)
    lines.push(
      `  ${row.label.padEnd(22)} ${String(row.turns).padStart(4)} turns  ${formatUsd(row.usd).padStart(9)}`,
    );
  lines.push(
    `  ${"Judge panel".padEnd(22)} ${"".padStart(4)}        ${formatUsd(estimate.judgesUsd).padStart(9)}`,
  );
  lines.push(
    `  ${"Simulated agent".padEnd(22)} ${"".padStart(4)}        ${formatUsd(estimate.simulatorUsd).padStart(9)}`,
  );
  const neurons = Math.round(estimate.totalUsd / NEURON_USD);
  lines.push(
    `  ${"Total".padEnd(22)} ${"".padStart(4)}        ${formatUsd(estimate.totalUsd).padStart(9)}  (~${neurons.toLocaleString()} neurons; ${(neurons / FREE_NEURONS_PER_DAY).toFixed(1)}x the daily free allocation)`,
  );
  const slowest = [...(estimate.minutes ?? [])].sort((a, b) => b.minutes - a.minutes)[0];
  if (slowest)
    lines.push(
      `Rate limits (Cloudflare: 20 requests/min per paid frontier model, 300 for others) keep this run to at least ${Math.ceil(slowest.minutes)} minutes (${slowest.id}: about ${slowest.count} requests).`,
    );
  return lines.join("\n");
}

export { JUDGES };
