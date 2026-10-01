---
id: WU-006
title: Add Salesforce record links and an honest in-app quickstart
status: complete
plan_sections: [3, 10, 13, 14, 16, 17]
owners: [agent]
---

# Objective

Make the demo self-guiding and verifiable: every represented or newly created Salesforce record links to its Salesforce page, and a concise in-app quickstart distinguishes supported workflows from unfinished and intentionally unavailable capabilities.

## Scope

- In-scope paths: `apps/web/`, `packages/ui/`, browser and unit tests, nearby demo documentation, and WU-006 evidence.
- Explicitly out of scope: new tools, new Salesforce writes, navigation pages, publish/send/activation behavior, or changes to proof boundaries.
- Record links use Salesforce's sandbox login origin so no org-specific hostname or credential is embedded in source.

## Contracts affected

- Schemas: none.
- Tools/actions: none.
- UI: insight record links, confirmed-write success link, confirmation record link, quickstart dialog, and demo copy.
- External state: none until the reviewed Worker build is deployed after merge.

## Acceptance criteria

- [x] Campaign tiles and confirmation details link to their Salesforce record in a new tab.
- [x] A successfully created review Task exposes a direct Salesforce link without logging or persisting credentials.
- [x] Quickstart offers supported sample prompts, a short run sequence, and a clearly labeled coming-soon/not-yet-built list.
- [x] Intentionally unavailable publish, send, activation, deletion, suppression, and arbitrary edits are not presented as roadmap promises.
- [x] Demo copy consistently describes fictional sample data, confirmations, and current boundaries.
- [x] Chrome and Edge browser evidence and the full repository verification pass.

## Verification

```text
pnpm test:unit
pnpm test:e2e
pnpm verify
pnpm security:blocked-words
```

## External mutations

None during implementation. Deployment follows the repository's reviewed merge workflow.

## Evidence

- Reports: generated under `artifacts/reports/WU-006/`.
- Screenshots: `artifacts/evidence/WU-006/quickstart-{chrome,edge}.png` plus updated workflow and recovery states.
- Known limitations: links require the evaluator to have an authenticated Salesforce sandbox session and permission to view the target record.

## Completion

- Final status: complete; record links, created-task read-back navigation, quickstart guidance, and demo boundary copy pass in Chrome and Edge.
- Commit: pending final commit.
- Summary: the app now provides a self-guided, proof-safe demo path without implying unfinished or prohibited capabilities are available.
