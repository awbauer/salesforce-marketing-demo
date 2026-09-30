---
id: WU-025
title: Cross-user isolation tests
status: active
plan_sections: [15, 16]
owners: [agent]
---

# Objective

This covers the Phase 5 negative tests for isolation across users and workspaces. It proves that one evaluator cannot read or act on another evaluator's data through the agent API.

## Coverage

Each user's agent is addressed exactly as the Worker router does after Access authentication: by `deriveAgentKey`, with that user's principal as props.

- **Image drafts** (shared D1 and R2): another user's draft is absent from list, returns 404 on serve, cannot be rejected (409), and cannot be preflighted for attachment (400). The owner can still read it.
- **Pending confirmations:** another user cannot execute them (409).
- **Turn history:** another user sees none of it.
- **Audit export** (shared D1): contains only the caller's confirmation rows.

## Acceptance criteria

- [x] Worker tests pass for all four surfaces.

## Verification

```text
pnpm test:worker
pnpm verify
```
