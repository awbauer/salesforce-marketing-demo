import { NEURON_USD, PRICING_AS_OF, PRICING_SOURCE } from "../../packages/evals/src/pricing.ts";
import {
  bootstrapMean,
  dimensionMeans,
  judgeAgreement,
  QUALITY_DIMENSIONS,
  topTwoBox,
} from "../../packages/evals/src/quality.ts";
import { EVAL_CHECKS } from "../../packages/evals/src/report.ts";

const sum = (values) => values.reduce((total, value) => total + value, 0);
const mean = (values) => (values.length ? sum(values) / values.length : 0);

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
    const costed = group.filter((result) => result.cost);
    const costUsd = sum(costed.map((result) => result.cost.usd));
    const passed = group.filter((result) => result.passed).length;
    const withCriteria = group.filter((result) => result.criteria?.length);
    const judged = group.filter((result) => result.quality && !result.quality.judgeError);
    const judgedIndexes = judged.map((result) => result.quality.index);
    const judgedCost = sum(judged.map((result) => result.cost?.usd ?? 0));
    const intent = judged.flatMap((result) =>
      result.quality.judges.flatMap((judge) =>
        judge.scores.actionIntent === undefined ? [] : [judge.scores.actionIntent],
      ),
    );
    const quality = judged.length
      ? {
          qualityIndex: bootstrapMean(judgedIndexes, `${group[0].model}|${group[0].suite}`),
          dimensionMeans: dimensionMeans(
            judged.map((result) => ({ scores: result.quality.dimensionMeans })),
          ),
          ...(intent.length ? { actionIntentTop2: topTwoBox(intent) } : {}),
          ...(judgedCost > 0
            ? { qualityPerUsd: mean(judgedIndexes) / (judgedCost / judged.length) }
            : {}),
        }
      : {};
    return {
      model: group[0].model,
      suite: group[0].suite,
      passed,
      total: group.length,
      ...(costed.length
        ? {
            costUsd,
            costPerTurnUsd: costUsd / costed.length,
            ...(passed ? { costPerPassUsd: costUsd / passed } : {}),
          }
        : {}),
      ...(withCriteria.length
        ? {
            criteriaMetRate: mean(
              withCriteria.map(
                (result) =>
                  result.criteria.filter((item) => item.met).length / result.criteria.length,
              ),
            ),
          }
        : {}),
      ...quality,
      // A check is rated over the turns that measured it, and left out when none did.
      checkRates: Object.fromEntries(
        EVAL_CHECKS.flatMap((check) => {
          const measured = group.filter((result) => result.checks[check] !== undefined);
          return measured.length
            ? [[check, measured.filter((result) => result.checks[check]).length / measured.length]]
            : [];
        }),
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

/** Spend across the run, split by who incurred it, with the pricing snapshot it was computed from. */
export function summarizeCost(
  results,
  { judgeCosts = [], simulatorCost = { usd: 0, neurons: 0 } } = {},
) {
  const contestantsUsd = sum(results.map((result) => result.cost?.usd ?? 0));
  const judgesUsd = sum(judgeCosts.map((cost) => cost.usd));
  const totalUsd = contestantsUsd + judgesUsd + simulatorCost.usd;
  return {
    contestantsUsd,
    judgesUsd,
    simulatorUsd: simulatorCost.usd,
    totalUsd,
    neurons: totalUsd / NEURON_USD,
    pricingAsOf: PRICING_AS_OF,
    pricingSource: PRICING_SOURCE,
  };
}

/** Judge agreement over the turns that two judges both scored. */
export function summarizeAgreement(results) {
  return judgeAgreement(
    results.filter((result) => result.quality).map((result) => result.quality.judges),
  );
}

export { QUALITY_DIMENSIONS };
