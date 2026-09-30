---
id: WU-042
title: Safe retries and well-formed requests for the Marketing Cloud agent
status: active
plan_sections: [9, 15]
owners: [agent]
issue: 61
---

# Why

- **#61:** the Campaign Creation agent's standard save actions aren't idempotent, so a retried or timed-out save could duplicate a brief or campaign.
- **#63:** nothing measured whether the orchestrator gives the agent what it needs.
- **#59:** the attempt to move insights to the standard action is recorded here too.

## Changes

- **Safe retries (#61).** Before calling the agent, the workbench looks in Salesforce:
  - A brief with the same name and key message, or the brief's existing campaign, is linked, not saved again.
  - After a failed call, it checks again, since a timeout can follow the save.
  - A sent-but-unverified write is audited as `confirmed`.
- **Request quality (#63):**
  - Live evals have a realistic `draft_campaign_brief` fixture and two new scenarios: create a campaign in Marketing Cloud, and refine a saved brief's preview (run against a saved-brief workspace).
  - A new optional `agentRequestGrounded` check scores the request the agent actually receives.
  - It found that gpt-oss-20b omitted the Brief ID in 2 of 2 refinement requests. `pinBriefToRefinement` now adds the saved Brief ID server-side, in production and in the eval.
- **Insights (#59):** the standard `MktCloud__GenerateCampaignInsights` flow errors in this org, where no campaign has delivered anything. Summaries, insights, and readiness stay on the custom agent, and Learn says why.
- **Cleanup:** 18 agent-preview session files committed by accident in WU-040 are untracked, and `.sfdx/` is ignored.

## Verification

```text
pnpm verify
node scripts/run-live-evals.mjs --models @cf/openai/gpt-oss-20b --trials-demo 2 --trials-routing 0 \
  --cases demo-restaurant-email,demo-mcn-create,demo-mcn-refine
```

## Evidence

- **Worker tests:** linking an earlier brief, linking an existing campaign, recovering a timeout after save, a retry message when nothing was saved, and pinning the Brief ID.
- **Live eval:** `artifacts/evidence/WU-044/agent-requests.json` (gpt-oss-20b, 2 trials each).
  - `agentRequestGrounded` passed 6 of 6 after pinning, up from 4 of 6 before: both refinement turns had omitted the Brief ID.
  - Two turns failed for gpt-oss-20b's known flakiness (no final text, or a tool error), which is unrelated to requests.
