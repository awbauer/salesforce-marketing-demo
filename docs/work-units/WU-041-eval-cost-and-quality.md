---
id: WU-041
title: Evaluation cost, frontier models, scenario rubrics, and quantified quality
status: active
plan_sections: [10, 16, 17]
owners: [agent]
---

# Why

Andrew Bauer asked the Evaluations process to:

- estimate LLM usage cost from Cloudflare's pricing
- include more expensive models
- say what "good" means for each demo scenario
- quantify the qualitative questions: is the email engaging, and would a customer act on it

Until now a run recorded tokens but not dollars. Its five checks were all pass/fail, so nothing measured whether an answer was any good. And the drafting tools returned one canned string, so no judge could tell the models apart on creative work.

## Changes

- **Cost.**
  - `packages/evals/src/pricing.ts` holds Cloudflare's per-million-token rates: uncached, cached, and output.
  - Neurons are derived at $0.011 per 1,000, and an unknown model throws instead of costing $0.
  - Every turn, judge call, and simulated-agent call is priced.
  - Reports carry cost per turn and per passing turn, plus a run total split into models, judges, and the simulated agent.
- **Estimate and cap.**
  - `scripts/lib/eval-estimate.mjs` projects a run from the last report's token use.
  - `--dry-run` prints it and exits, and `--max-usd` (default $2, or $15 with `--tier frontier`) refuses to start above it.
- **Models.**
  - Default tier: gpt-oss-120b, gpt-oss-20b, GLM-4.7-Flash.
  - `--tier frontier` adds Llama 4 Scout, Kimi K2.6, GLM-5.3 and DeepSeek V4 Pro.
- **Rubrics.** `packages/evals/src/rubric.ts` gives each demo scenario:
  - a goal
  - an audience persona where a customer is involved
  - deterministic criteria (for the Coastline campaign: menu item, real weather, time of day, cited past results, key message length, KPI)
  - dimension weights

  Criteria are reported as "criteria met" beside the pass gate, which is unchanged.
- **Quality.**
  - Two judges from different families (GLM-5.3, DeepSeek V4 Pro) rate answers 1 to 5 on anchored scales: context fidelity, accuracy, clarity, brand voice, engagement, marketer usefulness, and would-act.
  - For would-act the judge answers as the persona, and the report shows the top-2-box share.
  - Ratings combine into a 0 to 100 Quality Index with a seeded 95% bootstrap interval, plus judge agreement.
  - No model judges its own family.
  - The judges run at low reasoning effort: at default effort they spent the whole token budget thinking and returned no text.
- **Calibration.** `pnpm eval:calibrate` scores hand-written strong, mediocre, and weak answers and requires the right order and a 30-point gap. The result is recorded in the report.
- **Simulated Marketing Cloud agent.** One fixed reference model answers the drafting tools, so creative quality depends on what the orchestrator asked for and how it presents the result.
- **UI.**
  - The Evaluations view gains:
    - quality, would-act, criteria and cost columns
    - a cost-versus-quality chart
    - a per-scenario rubric grid
    - the lowest-scoring answers, with judge evidence
    - cost, dimension, judge and calibration methodology
  - Reports recorded before this change still render.
- **Rescore.** `pnpm eval:rescore` back-fills cost on older reports from stored tokens.

## Acceptance criteria

- [x] Cost is computed from Cloudflare list prices, unit-tested, and shown per turn, per pass and per run.
- [x] A run prints a projection, and `--max-usd` stops it before any call.
- [x] Frontier models are opt-in and priced.
- [x] Every demo scenario has a goal, criteria and weights, and a test enforces it.
- [x] Judges pass calibration, and the report shows agreement and intervals.
- [x] Old reports still render.
- [ ] A full frontier run is published. Deliberately deferred: the projected cost on the merged 19-scenario set is about $9 and about 55 minutes, so it is left for a maintainer to run when wanted (see Evidence).

## Verification

```text
pnpm test:unit
pnpm typecheck
pnpm learn:check
pnpm eval:live --tier frontier --dry-run
pnpm eval:calibrate
pnpm eval:live --tier frontier --max-usd 15
pnpm exec playwright test tests/e2e/workbench.spec.ts
```

## Limitations

- Quality scores are LLM-judge ratings, not customer behavior. Use them to rank models, not to forecast click or order rates.
- The simulated agent is one fixed model, not the real Salesforce agent.
- Prices are a dated snapshot of Cloudflare's list prices.

## External mutations

Workers AI inference on the proof account (calibration, smoke runs, and the published run), billed at list price. No Salesforce or production changes.

## Evidence

- **Unit and e2e:** typecheck, all unit and worker tests, `eval`, `learn:check`, `docs:check`, `contracts:check`, `hxl:check`, `sf:metadata:check`, and the Evaluations e2e in Chrome and Edge (screenshots in `artifacts/evidence/WU-041/`, drawn from a mocked report).
- **Judge calibration:** [artifacts/reports/eval-calibration.json](../../artifacts/reports/eval-calibration.json). Both judges ranked strong > mediocre > weak on every reference, with mean strong-minus-weak gaps of 67 and 72 index points.
- **Live runs during development:**
  - A smoke test and full frontier runs on the original 11 demo scenarios.
  - Two of those runs were invalidated by harness problems, both fixed here: per-minute rate limits (429), then an expired sign-in token (401).
  - On the clean parts of those runs, cost and quality separated the models: Llama 4 Scout scored about 25 on the Quality Index and Kimi K2.6 about 72, and the projected cost tracked actual within about 20 to 50 percent.
- **Not done:** a full published run on the merged 19-scenario set. Run `pnpm eval:live --tier frontier --dry-run` for the projection, then `pnpm eval:live --tier frontier --max-usd 15` and commit the resulting `apps/web/public/evals/latest.json`.
