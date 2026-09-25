---
id: WU-012
title: Complete chat turns when the Salesforce catalog is unavailable
status: active
plan_sections: [10, 13, 16, 17]
owners: [agent]
---

# Objective

Prevent explicit Salesforce requests from becoming empty interrupted turns while the governed MCP catalog is reconnecting or unavailable.

# Scope

- In-scope paths: intent detection, catalog wait and fail-closed response, technical trace wording, and regression tests.
- Explicitly out of scope: Salesforce writes, bypassing OAuth, fixture substitution, or changing proof data.

# Acceptance criteria

- [x] The exact sample-campaign summary prompt is recognized as requiring `summarize_campaign` independently of current tool discovery state.
- [x] Tool discovery gets a bounded ten-second recovery window.
- [x] A missing required tool returns a completed actionable response and never calls the model without the required evidence source.
- [x] The technical trace distinguishes a missing catalog from an intentional tool-free answer.
- [ ] Browserless production diagnostics pass after merge and deployment.

# Verification

```text
pnpm verify
PROOF_BASE_URL=https://marketing.becurious.one CF_ACCESS_JWT=<ephemeral-user-jwt> pnpm test:production:chat
```

# External mutations

Deploy the merged Worker through the existing main-branch workflow. No Salesforce mutation is required.

# Evidence

- The 2026-09-25 screenshot shows the exact summary prompt followed by two empty assistant records, two misleading tool-free traces, and an interrupted-turn banner.
- Production Worker deployment `28976a5e-6fb7-467b-a7ca-9133ca1d3cea` contains PR #11, ruling out stale deployment as the cause.

# Completion

- Final status: active pending delivery and production protocol read-back.
- Commit: pending.
- Summary: pending.
