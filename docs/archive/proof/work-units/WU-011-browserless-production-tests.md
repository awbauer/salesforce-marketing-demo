---
id: WU-011
title: Add browserless production chat verification
status: active
plan_sections: [10, 13, 16, 17]
owners: [agent]
---

# Objective

Catch chat presentation and production-stream failures without relying on a rendered browser or manual clicking.

# Scope

- In-scope paths: assistant-text normalization, chat error-state presentation, a read-only production diagnostic, CLI smoke checks, and regression tests.
- Explicitly out of scope: arbitrary diagnostic prompts, Salesforce writes, bypassing per-user authentication, or weakening browser coverage for final visual acceptance.

# Acceptance criteria

- [x] JSON-wrapped model text is rendered as readable assistant text.
- [x] A completed assistant answer is not paired with a contradictory interruption banner.
- [x] Worker tests prove first-step-only forced tool selection with mocked inputs.
- [x] An authenticated fixed-scenario HTTP diagnostic invokes the same production orchestration implementation as interactive chat.
- [x] The production CLI asserts governed tool selection, tool completion, assistant completion, and absence of stream error or abort frames.
- [ ] The production CLI passes against the merged deployment with an ephemeral evaluator Access JWT.

# Verification

```text
pnpm verify
PROOF_BASE_URL=https://marketing.becurious.one CF_ACCESS_JWT=<ephemeral-user-jwt> pnpm test:production:chat
```

# External mutations

Deploy the merged Worker through the existing main-branch workflow. The diagnostic is read-only, accepts only the fixed `campaign-summary` scenario, and uses the authenticated evaluator's existing Salesforce connection.

# Evidence

- Unit tests reproduce the JSON envelope and contradictory error-state screenshots without a browser.
- Worker tests cover semantic result classification, explicit routing, and first-step-only tool forcing.
- Live protocol evidence is pending merge and deployment.

# Completion

- Final status: active pending delivery and production protocol read-back.
- Commit: pending.
- Summary: pending.
