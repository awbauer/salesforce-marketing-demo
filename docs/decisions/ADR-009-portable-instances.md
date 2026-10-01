# ADR-009: Portable workbench instances

Status: accepted

Date: 2026-09-30

## Context

The repository was a single-client proof bound to one Cloudflare account, one Workers AI orchestrator model (ADR-005) and Section 17's fixed model, region and retention values. The owner asked for a template that anyone can clone, run locally with local models, and optionally deploy to Cloudflare or AWS for a client conversation. Work unit: WU-052.

## Decision

- Every per-instance choice lives in one validated **instance profile** (`packages/contracts/src/profile.ts`). `pnpm profile:build` compiles `workbench.profile.json` (or `profiles/example.profile.json`) into the gitignored `apps/edge/src/generated/profile.ts`.
- The orchestrator resolves its chat model through `apps/edge/src/models.ts`: Ollama or any OpenAI-compatible endpoint (default `gpt-oss:20b` on `127.0.0.1:11434`), Workers AI, or Amazon Bedrock. The gpt-oss tool-call repair middleware applies only to gpt-oss models.
- Local runs need no account. `wrangler.jsonc` is the account-free local config; the Cloudflare config is a template under `templates/cloudflare/`.
- Images come from the profile's image provider. The default `placeholder` draws a deterministic PNG locally.
- With `ENVIRONMENT=local`, deterministic fixtures still answer the flows they cover; anything else goes to the configured model when its endpoint answers, and to scripted mode when it does not. `CHAT_ENGINE=fixture` forces scripted mode (tests, e2e).
- The workerd runtime stays. Local and AWS runs use the open-source workerd runtime that `vite`/`wrangler dev` embed; there is no Node port of the Durable Object backend.

## Consequences

- The invariants check now enforces "no model id in the orchestrator or `wrangler.jsonc`, no account ids in `wrangler.jsonc`" instead of fixed model literals.
- Section 17's fixed model, region and retention values no longer bind instances; the confirmed-write set, confirmation flow and read-only/no-publish guardrails do.
- The local model's tool-calling quality is the presenter's responsibility; the live evals runner remains the way to measure it.
- Storage adapters were dropped from the plan: D1 and R2 run locally in workerd with persisted state, so no non-Cloudflare storage layer is needed.

## Supersedes

ADR-005 (orchestrator model fixed to Workers `gpt-oss-20b`), and Section 17's fixed model, image cap and retention values.
