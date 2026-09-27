import { requestedToolName } from "../apps/edge/src/turn-policy.ts";
import { classifyPolicyIntent } from "../packages/contracts/src/index.ts";
import { routingCases } from "../packages/evals/src/cases.ts";
import { report } from "./lib/report.mjs";

// The production routers: the policy router first, then the intent router. A prompt neither
// routes goes to the model, which this deterministic evaluation scores as unrouted.
function route(prompt) {
  const policyIntent = classifyPolicyIntent(prompt);
  if (policyIntent === "unsupported") return "unsupported";
  if (policyIntent === "confirmation-required") return "confirmation_required";
  return requestedToolName(prompt) ?? "model";
}
const results = routingCases.map((test) => ({
  ...test,
  actual: route(test.prompt),
  passed: route(test.prompt) === test.expected,
}));
const score = results.filter((result) => result.passed).length / results.length;
await report("evaluation", {
  status: score >= 0.9 ? "passed" : "failed",
  score,
  threshold: 0.9,
  total: results.length,
  mode: "production-policy-and-intent-routers",
  results,
});
console.log(
  `Routing evaluation: ${(score * 100).toFixed(0)}% (${results.filter((item) => item.passed).length}/${results.length}), threshold 90%.`,
);
if (score < 0.9) process.exit(1);
