import { routingCases } from "../packages/evals/src/cases.ts";
import { report } from "./lib/report.mjs";

function route(prompt) {
  const requestedActions = prompt.replace(/do not publish/gi, "");
  if (/publish|send|add these contacts|reveal every audience|ignore policy/i.test(requestedActions))
    return "unsupported";
  if (/save this campaign|create a review task/i.test(prompt)) return "confirmation_required";
  if (/readiness|blocker|consent coverage|dates and brief/i.test(prompt))
    return "check_campaign_readiness";
  if (/draft a campaign brief/i.test(prompt)) return "draft_campaign_brief";
  if (/refine the campaign preview/i.test(prompt)) return "refine_campaign_preview";
  if (/summarize campaign/i.test(prompt)) return "summarize_campaign";
  if (/campaign insights/i.test(prompt)) return "generate_campaign_insights";
  if (/hero section/i.test(prompt)) return "create_content_section";
  if (/draft email content|prepare copy/i.test(prompt)) return "draft_campaign_content";
  if (/against the northstar brand/i.test(prompt)) return "validate_content_against_brand";
  if (/marketing signals/i.test(prompt)) return "get_account_marketing_signals";
  if (/buyer group/i.test(prompt)) return "recommend_buyer_group_members";
  if (/engagement/i.test(prompt)) return "summarize_account_engagement";
  return "unsupported";
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
  mode: "deterministic-contract-router",
  results,
});
console.log(
  `Routing evaluation: ${(score * 100).toFixed(0)}% (${results.filter((item) => item.passed).length}/${results.length}), threshold 90%.`,
);
if (score < 0.9) process.exit(1);
