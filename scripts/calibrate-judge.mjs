// Checks the judge panel against hand-written strong, mediocre, and weak reference answers.
// Each judge must rank strong > mediocre > weak on every reference and separate strong from weak
// by a clear margin. The result is written next to the reports and folded into the next published run.
// Usage: pnpm eval:calibrate
import { mkdirSync, writeFileSync } from "node:fs";
import { CALIBRATION_REFERENCES } from "../packages/evals/src/calibration.ts";
import { formatUsd, sumCosts } from "../packages/evals/src/pricing.ts";
import { qualityIndex } from "../packages/evals/src/quality.ts";
import { scenarioRubrics } from "../packages/evals/src/rubric.ts";
import { JUDGES, judgeOnce } from "./lib/eval-judge.mjs";
import { createEvalProvider } from "./lib/eval-provider.mjs";

const OUT = "artifacts/reports/eval-calibration.json";
const MIN_GAP = 30;

const provider = createEvalProvider().background;
const costs = [];
const details = [];
const gaps = {};
let passed = true;

for (const judge of JUDGES) {
  const strongMinusWeak = [];
  for (const reference of CALIBRATION_REFERENCES) {
    const scored = {};
    for (const level of ["strong", "mediocre", "weak"]) {
      const outcome = await judgeOnce(provider, judge, {
        caseId: reference.caseId,
        prompt: reference.prompt,
        answer: reference.answers[level],
        trace: reference.trace,
        toolRequests: [],
      });
      costs.push(outcome.cost);
      if (!outcome.verdict) {
        console.error(`${judge.label} failed on ${reference.caseId}/${level}: ${outcome.error}`);
        passed = false;
        continue;
      }
      scored[level] = qualityIndex(
        outcome.verdict.scores,
        scenarioRubrics[reference.caseId].weights,
      );
    }
    const ordered = scored.strong > scored.mediocre && scored.mediocre > scored.weak;
    if (!ordered) passed = false;
    if (scored.strong !== undefined && scored.weak !== undefined)
      strongMinusWeak.push(scored.strong - scored.weak);
    details.push({ judge: judge.id, caseId: reference.caseId, ...scored, ordered });
    console.log(
      `${judge.label.padEnd(16)} ${reference.caseId.padEnd(22)} strong ${scored.strong?.toFixed(0)}  mediocre ${scored.mediocre?.toFixed(0)}  weak ${scored.weak?.toFixed(0)}  ${ordered ? "ok" : "MISORDERED"}`,
    );
  }
  const gap =
    strongMinusWeak.reduce((sum, value) => sum + value, 0) / (strongMinusWeak.length || 1);
  gaps[judge.id] = gap;
  if (gap < MIN_GAP) passed = false;
}

mkdirSync("artifacts/reports", { recursive: true });
writeFileSync(
  OUT,
  `${JSON.stringify({ ranAt: new Date().toISOString(), passed, strongMinusWeak: gaps, details }, null, 1)}\n`,
);
console.log(
  `Calibration ${passed ? "passed" : "FAILED"} (mean strong-weak gap ${Object.values(gaps)
    .map((gap) => gap.toFixed(0))
    .join(
      ", ",
    )} points, minimum ${MIN_GAP}); cost ${formatUsd(sumCosts(costs).usd)}. Wrote ${OUT}.`,
);
if (!passed) process.exit(1);
