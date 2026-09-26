---
id: WU-023
title: Operator kill switches and audit export
status: active
plan_sections: [15, 16, 17]
owners: [agent]
---

# Objective

Phase 5 requires tool kill switches and a compact audit export. Operators can pause all Salesforce writes, or turn off individual curated tools, without a code change. Each evaluator can download their own audit record.

## Behavior

- **Switches:** `WRITES_ENABLED` and `DISABLED_TOOLS` are optional Worker secrets, parsed by `parseOperationControls` in contracts. They are not `wrangler.jsonc` vars, because Workers Builds would reset those on every deploy. When unset, everything is enabled.
- **Paused writes:**
  - Preflight and execute return `503 WRITES_DISABLED`, and nothing is written.
  - The Insights panel shows a paused notice.
  - Create review request and Attach to campaign are disabled, with the reason shown.
- **Disabled read tools:** removed from the model's tool set. A request routed to one gets a clear "turned off by an operator" reply, with no demo-data substitution.
- **API:** `GET /agent/operations` reports the controls. `GET /agent/audit/export` downloads JSON with the caller's `confirmation_audit` rows and turn summaries within the 14-day retention window. History links to the export.
- The operator runbook is in `infra/cloudflare/pot/README.md`.

## Acceptance criteria

- [x] Worker tests cover parsing, the write-block decision, the operations endpoint, and the audit export contents and download headers.
- [x] E2E in Chrome and Edge: paused-writes notice, disabled write action, and the audit export link.
- [ ] After deploy: set `WRITES_ENABLED=false`, confirm a preflight returns 503 and the UI shows the notice, then delete the secret and confirm writes resume.

## Verification

```text
pnpm verify
pnpm exec playwright test tests/e2e/workbench.spec.ts
```
