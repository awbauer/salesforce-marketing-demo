---
id: WU-008
title: Create a meaningful Salesforce campaign review handoff
status: complete
plan_sections: [13, 14, 16, 17, 18, 19]
owners: [agent]
---

# Objective

Create an actionable Salesforce review Task that shows the campaign context, readiness findings, due date, and human review checklist instead of a sparse placeholder record.

## Scope

- In-scope paths: Salesforce review action and tests, Worker result mapping, web success state, nearby evaluator documentation.
- Explicitly out of scope: new Salesforce write classes, publishing or activation, production data, and Phase 4 asset generation.
- Prerequisites: the existing confirmed and idempotent `create-review-task` boundary.

## Contracts affected

- Schemas: additive review Task output fields.
- Tools/actions: `create-review-task`.
- Tiles/HXL: review creation success state only.
- External state: validate and deploy the bounded Apex/MCP metadata to the Salesforce sandbox.

## Acceptance criteria

- [x] A confirmed review request creates one Task with campaign context and an actionable checklist.
- [x] Missing brief or dates appear as explicit readiness findings and raise priority.
- [x] The Task has a due date and authoritative field-level read-back.
- [x] The app shows useful details and links to the created Salesforce record.
- [x] Documentation matches demonstrated behavior without changing Section 17 boundaries.

## Verification

```text
pnpm verify:fast
sf project deploy validate --target-org northstar-pot --source-dir salesforce/force-app/main/default/classes --test-level RunSpecifiedTests --tests NorthstarCampaignActionsTest
pnpm verify
```

## External mutations

- Deploy the updated review action and MCP description to the supplied Salesforce sandbox after validation; read back metadata and a confirmed Task.

## Evidence

- Reports: `pnpm verify` passed all 12 gates; Salesforce Apex run passed 10 tests with no failures.
- Screenshots: pending
- Deployment identifiers: Salesforce deployment `0AfjV000002mccvSAA`; Apex test run `707jV000004OIEZ`.
- Read-back results: deployed Apex and MCP definition reported success; tests verify populated fields, missing-field findings, idempotent replay, and authoritative Task read-back.
- Known limitations: image generation and attachment remain Phase 4.

## Completion

- Final status: complete; PR #8 merged and the user verified the populated Salesforce record.
- Commit: `7e92281`
- Summary: meaningful review Task creation, authoritative field read-back, and app presentation shipped.
