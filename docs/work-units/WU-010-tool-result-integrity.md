---
id: WU-010
title: Make Salesforce tool results authoritative and observable
status: active
plan_sections: [3, 10, 13, 16, 17]
owners: [agent]
---

# Objective

Ensure the workbench routes explicit Salesforce campaign requests through the governed tool catalog, distinguishes transport success from a usable business result, and never substitutes presentation fixtures for missing Salesforce evidence.

# Scope

- In-scope paths: orchestrator routing, Salesforce tool-result classification, visible execution trace, tests, and browser evidence.
- Explicitly out of scope: new write capabilities, broad Salesforce CRUD, production data, changing the proof org, or weakening confirmation boundaries.

# Acceptance criteria

- [x] Protocol-level MCP success with an unavailable or empty business result is treated as unavailable evidence.
- [x] Explicit campaign summary and readiness prompts require their matching governed Salesforce tool when it is available.
- [x] Production orchestration context contains record references but no substantive fixture claims or metrics.
- [x] Tool loops have bounded steps and a total timeout.
- [x] The technical trace labels semantic failures and retains the sanitized payload for inspection.
- [x] JSON-wrapped model text is unwrapped for display, and a completed answer is not paired with a contradictory interruption banner.
- [ ] The live deployed app returns an honest limitation for the reproduced empty-business-unit response and completes the turn.

# Verification

```text
pnpm typecheck
pnpm test:worker
pnpm verify
PROOF_BASE_URL=https://marketing.becurious.one CF_ACCESS_JWT=<ephemeral-user-jwt> pnpm test:production:chat
```

# External mutations

Deploy the merged Worker through the existing main-branch deployment workflow. No Salesforce writes or metadata changes are required for this integrity fix.

# Evidence

- Browser reproduction on 2026-09-25: `summarize_campaign` returned MCP `isError: false` while its business message reported no available business units and its result was empty; the prior orchestrator then presented unsupported fixture-derived claims.
- Browser reproduction on 2026-09-25: an explicit Salesforce Campaign ID request selected no tool and left the turn active.
- Local tests classify protocol errors, semantic unavailability, and usable Salesforce results separately and verify deterministic routing for explicit summary and readiness requests.
- Unit-level presentation regressions cover JSON-envelope unwrapping and prevent simultaneous completed-answer/interruption states without requiring a browser.
- Worker-level regression fixtures cover protocol success with semantic failure and first-step-only tool forcing without requiring a live Salesforce session.
- The authenticated production diagnostic calls the same orchestration implementation over HTTP, asserts governed tool selection, tool completion, assistant completion, and absence of stream errors, and does not require a rendered browser UI.

# Completion

- Final status: active pending delivery and live browser read-back.
- Commit: pending.
- Summary: pending.
