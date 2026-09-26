import { EVAL_CHECKS } from "../../packages/evals/src/report.ts";

function percentile(values, fraction) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

export function summarize(results) {
  const groups = new Map();
  for (const result of results) {
    const key = `${result.model}|${result.suite}`;
    groups.set(key, [...(groups.get(key) ?? []), result]);
  }
  return [...groups.values()].map((group) => {
    const modelTurns = group.filter((result) => result.route === "model");
    return {
      model: group[0].model,
      suite: group[0].suite,
      passed: group.filter((result) => result.passed).length,
      total: group.length,
      checkRates: Object.fromEntries(
        EVAL_CHECKS.map((check) => [
          check,
          group.filter((result) => result.checks[check]).length / group.length,
        ]),
      ),
      latencyP50Ms: percentile(
        modelTurns.map((result) => result.latencyMs),
        0.5,
      ),
      latencyP90Ms: percentile(
        modelTurns.map((result) => result.latencyMs),
        0.9,
      ),
      meanOutputTokens: modelTurns.length
        ? Math.round(
            modelTurns.reduce((sum, result) => sum + result.outputTokens, 0) / modelTurns.length,
          )
        : 0,
    };
  });
}
