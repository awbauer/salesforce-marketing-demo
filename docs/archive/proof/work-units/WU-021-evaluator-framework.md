---
id: WU-021
title: Live evaluator framework exposed in the demo UI
status: active
plan_sections: [10, 16, 17]
owners: [agent]
issue: 21
---

# Objective

Evaluators can open an Evaluations view in the workbench and see real results from the production orchestrator pipeline across models, tool use, and demo scenarios, together with the methodology behind them. Resolves GitHub issue #21.

## Scope

- **Shared pipeline:** `apps/edge/src/turn-policy.ts` holds the turn routing, system prompt, step tool settings, output limit, and timeout. It has no Workers runtime imports, so both the orchestrator and the runner use it.
- **Runner:** `pnpm eval:live` (`scripts/run-live-evals.mjs`) runs three suites against each model through the production policy router, intent router, system prompt, forced-tool middleware, and step settings:
  - demo scenarios
  - routing through the full pipeline
  - routing by the model alone
- **Tools:** tools use the production Hosted MCP names and descriptions and return fictional fixtures.
- **Credentials:** they come from `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`, or from the authenticated wrangler session. Nothing is committed.
- **Contract:** `packages/evals/src/report.ts` (`EvalReportSchema`). The runner writes `apps/web/public/evals/latest.json`, and a unit test checks that the published file is internally consistent.
- **UI:** an Evaluations view (rail and header entry points) with a model comparison, checks by model per suite, a demo scenario grid, failed turns with route, finish reasons and excerpts, and the methodology and limitations. It shows an explicit empty state until a run is published.

## Checks

A turn passes only when all five checks pass:
- right tool (or no tool when the request must not reach Salesforce)
- non-empty answer
- no tool or provider errors
- plain text
- no false write claim (accurate disclaimers such as "nothing has been saved" are excluded)

## Acceptance criteria

- [x] The runner imports the production routing, prompt, and middleware rather than copies.
- [x] Report schema, consistency test, and UI covering both the empty and populated states (E2E in Chrome and Edge).
- [ ] A real run is published after the Workers AI daily allocation resets or the account moves to Workers Paid.

## Blocker found during delivery

The Cloudflare account is on the Workers AI free allocation of 10,000 neurons per day. The live model comparisons in WU-016 through WU-018 used it up, and all Workers AI calls, including production chat, returned HTTP 429 until the daily reset at 00:00 UTC. The first real run of this framework waits for that reset or for an upgrade to Workers Paid.

## Verification

```text
pnpm verify
pnpm exec playwright test tests/e2e/workbench.spec.ts
pnpm eval:live
```
