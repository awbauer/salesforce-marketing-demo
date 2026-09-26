---
id: WU-027
title: Precise intent routing and corrected evaluation scoring
status: active
plan_sections: [10, 16]
owners: [agent]
---

# Objective

Fix the production routing bug that the first live evaluation run exposed (#33), and correct a scorer false positive.

## Findings from the first run

- **Router bug:** `requestedToolName` forced `summarize_campaign` for any prompt containing "campaign", because "campaign" satisfied both halves of the summarize rule. Brief drafting, insights, preview refinement, copy preparation, and date-completeness prompts all received the summary tool regardless of model. As a result, routing through the full pipeline scored 45–50%, no better than the model choosing alone.
- **Scorer false positive:** a factual answer, "it has been sent to 12 400 recipients", was flagged as a false write claim.

## Behavior

- **Intent router:** ordered rules that each need an intent-specific signal (for example "insights", "refine … preview", "draft a … brief", "hero/section/footer", or a summarize verb plus a campaign). A bare "campaign" never forces a tool, and the router defers to the model when no rule matches.
  - Pipeline routing on the 20-prompt set is 20 of 20. The set was used to find the bug.
  - On 16 held-out paraphrases, written after the rules and not used for tuning, the router forced 13, all correctly, and deferred 3 to the model. Those prompts were written with knowledge of the rules, so this is a sanity check rather than an independent benchmark.
- **Scoring:** moved to `packages/evals/src/scoring.ts` with tests. Only first-person claims, or a record stated to be in a written state, count as write claims. Campaign facts and disclaimers do not.

## Acceptance criteria

- [x] Worker tests: full routing set through the policy and intent routers, held-out precision, and no summary forced by a bare "campaign".
- [x] Scoring unit tests for claims, disclaimers, campaign facts, and Markdown.
- [ ] Re-run `pnpm eval:live` after deploy when Workers AI capacity allows, and publish the before and after comparison.

## Verification

```text
pnpm verify
```
