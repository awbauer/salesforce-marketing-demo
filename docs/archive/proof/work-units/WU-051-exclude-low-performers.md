---
id: WU-051
title: Mark low-performing eval models as excluded, and add a manual live-evals workflow
status: active
plan_sections: [10]
owners: [agent]
---

# Objective

- Two low performers stay in the eval model list but are marked `excluded`: the runner skips them by default, and the report lists them as not included.
- A manual GitHub Actions workflow runs `pnpm eval:live` and opens a pull request with the regenerated report.

## Scope

- In-scope paths: `scripts/run-live-evals.mjs`, `.github/workflows/evals.yml`.
- Explicitly out of scope: regenerating `latest.json` (needs a live run), the production orchestrator model, the judge models, pricing entries (kept so an explicit run still prices).

## Selection

Passed turns across the three suites, from the committed report (2026-09-26):

| Model | Passed | Decision |
| --- | --- | --- |
| Kimi K2.6 | 101 of 110 | keep |
| gpt-oss-120b | 90 of 110 | keep |
| GLM-4.7-Flash | 87 of 110 | excluded |
| gpt-oss-20b | 84 of 110 | keep: the production orchestrator (ADR-005) and the baseline |
| Llama 4 Scout 17B | 24 of 110 | excluded |
| GLM-5.3, DeepSeek V4 Pro | not in the report | keep: never measured, so no evidence they underperform |

## Workflow

`Live evals` (`workflow_dispatch`) takes tier, optional model ids, trial counts, judge on/off and a cost cap. It never pushes to `main`: it commits `apps/web/public/evals/latest.json` to `evals/run-<run id>`, runs the blocked-word gate, and opens a pull request for Andrew to merge. It needs the secrets `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` and `BLOCKED_WORDS_LOCAL`, and the repository setting that lets Actions create pull requests.

## Acceptance criteria

- [x] Excluded models remain in `MODELS` and are skipped by default, including with `--tier frontier`.
- [x] An explicit `--models` still runs an excluded model.
- [ ] `pnpm verify` passes.
- [ ] The workflow has run once from the Actions tab (not demonstrated; needs the secrets).

## External mutations

none from this change. Each workflow run calls Workers AI (billed) and creates a branch and pull request.

## Evidence

- Known limitations: the committed report still shows the pre-change model set until the workflow runs. GLM-4.7-Flash trails gpt-oss-120b by only 3 of 110 turns, which is within noise. The workflow file is untested until it runs on GitHub.

## Completion

- Final status: active
