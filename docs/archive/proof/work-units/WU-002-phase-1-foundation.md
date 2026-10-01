---
id: WU-002
title: Deliver the Phase 1 Cloudflare and React foundation
status: complete
plan_sections: [5, 6, 11, 12, 13, 14, 15]
owners: [agent]
---

# Objective

Deliver an agent-operable React and Cloudflare foundation in which an authenticated proof user can open a workspace, sustain and recover a server-authoritative chat conversation, and see typed mock insight tiles, with local quality gates and deployment configuration ready for the proof account.

## Scope

- In-scope paths: root workspace/tooling, `.github/workflows/`, `apps/web/`, `apps/edge/`, `packages/contracts/`, `packages/ui/`, `packages/evals/`, `infra/cloudflare/pot/`, `scripts/`, `artifacts/`, and Phase 1 documentation.
- Explicitly out of scope: Salesforce metadata and live Salesforce calls, MCP portal configuration, campaign image generation, HXL widgets, production deployment, and any write to Salesforce.
- Prerequisites: Node 26+, pnpm 11+, the fixed defaults in plan Section 17, and Cloudflare account authorization for the live proof gate.

## Contracts affected

- Schemas: proof configuration, access principal, workspace session, insight tile, activity event, health response, and error envelope.
- Tools/actions: mock read/draft activity only; no external mutation tools.
- Tiles/HXL: native React tile registry with mock campaign brief, readiness, and performance tiles; HXL deferred.
- External state: optional Cloudflare proof Worker, Access application, AI Gateway, Durable Object namespace, D1 database, R2 bucket, and Workers AI binding during the live gate.

## Acceptance criteria

- [x] pnpm monorepo, deterministic lockfile, stable command contract, CI workflow, generated reports, and invariant checks exist.
- [x] React workspace shell provides workspace rail, conversation canvas, source/activity state, insight board, and accessible loading/empty/error/stale/permission/recovery states.
- [x] `useAgent` and `useAgentChat` connect to `MarketingOrchestrator`; the browser does not choose the Durable Object key.
- [x] `MarketingOrchestrator` persists chat through SQLite-backed `AIChatAgent`, supports resumable streaming and cancellation, and exposes typed tile/activity state.
- [x] Worker validates a Cloudflare Access JWT in proof mode, derives the principal and workspace key server-side, and permits an explicit local-only principal in local mode.
- [x] Wrangler configuration uses today's compatibility date, generated binding types, SQLite Durable Object migration, Static Assets SPA routing, Workers AI, D1, R2, logs, and traces.
- [x] Health, readiness, session, and structured error endpoints are covered by Workers-runtime tests.
- [x] Reconnect, cross-workspace isolation, static asset fallback, and server-derived routing are tested without live credentials.
- [x] Fixed 20-prompt evaluation and Section 17 invariant/tool-catalog gates fail closed.
- [x] Threat/data-classification record, proof setup/rollback instructions, and evidence are current.
- [x] `pnpm verify:fast`, `pnpm verify`, `pnpm eval`, `pnpm test:e2e`, `pnpm sf:validate`, and `pnpm docs:check` behave as documented and emit reports.
- [x] Live proof checks are run and recorded, or the exact credential/account authorization boundary is reported without claiming the pre-deployment gate passed.

## Verification

```text
pnpm verify:fast
pnpm verify
pnpm eval
pnpm test:e2e
pnpm sf:validate
pnpm docs:check
pnpm exec wrangler deploy --dry-run
```

Run `pnpm test:e2e:live` with the deployed `PROOF_BASE_URL`. Its default mode
proves the unsigned Access perimeter; authenticated mode accepts only an
ephemeral, human-issued `CF_ACCESS_JWT` from the email one-time-PIN flow. Service
tokens are prohibited by the proof architecture.

## External mutations

Potential Phase 1 proof resources are limited to the isolated Cloudflare proof Worker and its Access policy, AI Gateway, Durable Object migration, D1 database, and R2 bucket. Each live mutation requires resource IDs, deployment version, and health/read-back results in evidence. No Salesforce mutation is permitted.

## Evidence

- Reports: `artifacts/reports/WU-002/`.
- Screenshots: `artifacts/evidence/WU-002/` for desktop Chrome and Edge-equivalent Playwright projects.
- Local verification: `pnpm verify` passed 10/10 gates; Workers-runtime tests passed 6/6; the fixed routing evaluation passed 20/20; `wrangler deploy --dry-run` bundled 5 static assets and every configured binding.
- UI evidence: `workbench-chrome.png` and `workbench-edge.png`; both projects passed the semantic navigation, labelled composer, keyboard-focus, durable turn, reload recovery, source/freshness, and screenshot assertions. Microsoft Edge is not installed on this host, so the Edge project uses Playwright's Desktop Edge profile with installed Chrome; actual Edge remains a live-gate check.
- Deployment identifiers: Andrew Bauer account Worker version `929f6957-53aa-4f22-9fcf-e2630eb8ffa0`; D1 database `120cf689-0652-476c-9e4e-8af5b83e3627`; R2 bucket `northstar-marketing-workbench-pot-campaign-assets`; AI Gateway `northstar-marketing-pot`. The deployed Worker URL is `https://northstar-marketing-workbench-pot.andrew-bauer.workers.dev`.
- Read-back results: Access redirects unsigned requests to the configured Cloudflare Access team domain, and the perimeter-only live gate passed with HTTP 302. A human email-one-time-PIN session then read `/api/ready` successfully with all five binding checks true and a correlation ID; the sanitized response is recorded in `authenticated-readback.json`. After the AI Gateway was provisioned, a Worker tail recorded an authenticated WebSocket turn, a completed Workers AI response through the gateway, a clean stream close, a persisted 304-token assistant message, and a 200 history read-back. The final deployment adds the verified plain-text output constraint and safe persisted-message normalizer; the sanitized combined result is in `live-chat-readback.json`. The deployed Worker has `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` secret bindings; their values are intentionally absent from the repository. The application uses the existing shared reusable `AWB` allow policy, which remains outside this work unit's ownership. D1 and R2 read-backs match the recorded resources, and `pnpm verify` passed all 10 gates after deployment.
- Known limitations: Microsoft Edge is not installed on this build host, so the checked-in Edge project uses the current Edge device profile against installed Chromium rather than the branded Edge binary. Teardown is documented but intentionally not run while the proof is active. Salesforce, MCP portal, HXL, and image generation intentionally begin in later phases.

## Completion

- Final status: complete; deployed to the Andrew Bauer proof account and verified through the human email-one-time-PIN path
- Commit: resolve with `git log -1 --format=%H -- docs/work-units/WU-002-phase-1-foundation.md`
- Summary: the Phase 1 vertical slice, agent-operated gates, proof deployment, Access perimeter, and authenticated readiness read-back are implemented and evidenced.
