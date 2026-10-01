---
id: WU-014
title: Isolate evidence turns from legacy session claims
status: active
plan_sections: [10, 13, 16, 17]
owners: [agent]
---

# Objective

Prevent unsupported claims from old durable conversations from contaminating new Salesforce evidence turns, and render incomplete JSON-wrapped model text safely.

# Scope

- In-scope paths: model conversation assembly, assistant-text normalization, regression tests, and production read-back.
- Explicitly out of scope: Salesforce writes, arbitrary record access, or treating workspace presentation data as authoritative evidence.

# Acceptance criteria

- [x] Each new evidence turn sends only the latest user request plus the authoritative system policy to the model. (Superseded by WU-030: a bounded, text-only conversation window restores follow-up context.)
- [x] Persisted legacy assistant claims cannot enter a later model prompt.
- [x] Complete and interrupted JSON-wrapped assistant text renders as readable text rather than a raw envelope.
- [x] Pull requests validate the governed Salesforce core and merged `main` changes deploy it through a serialized, exact-org-bound pipeline.
- [ ] The already-merged Salesforce MCP rebinding is deployed by the configured pipeline.
- [ ] Browserless production diagnostics pass after merge and deployment.

# Verification

```text
pnpm verify
PROOF_BASE_URL=https://marketing.becurious.one CF_ACCESS_JWT=<ephemeral-user-jwt> pnpm test:production:chat
```

# External mutations

The Worker deploy follows the existing main-branch workflow. The Salesforce workflow validates changes on pull requests, deploys source-controlled metadata after merge, and retrieves the governed MCP definition for read-back.

# Evidence

- The 2026-09-25 screenshot shows a new response citing non-authoritative workspace data and stating that no Salesforce tool ran, demonstrating contamination from persisted legacy conversation context.
- The same response displays an unterminated JSON message envelope, which the prior complete-JSON-only normalizer could not unwrap.
- `pnpm verify` passed all 12 repository gates, including 21 unit tests, 15 Worker tests, the Salesforce metadata contract, HXL validation, and 20 evaluation cases.
- The Worker regression suite proves that a persisted assistant claim is excluded from the next evidence turn; the UI regression suite proves recovery of an interrupted JSON message envelope.
- Salesforce check-only deployment `0AfjV000002nTsYSAU` succeeded against the approved proof org for the governed core; the read-back classified the Hosted MCP definition and evaluator permission set as changed.
- The expected proof-org ID is supplied only by the protected GitHub environment and is required to be non-empty before the exact-target comparison runs.

# Completion

- Final status: active pending delivery, authorized Salesforce deployment, and production read-back.
- Commit: pending.
- Summary: pending.
