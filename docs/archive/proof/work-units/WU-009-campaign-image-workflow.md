---
id: WU-009
title: Generate governed campaign image drafts outside Salesforce
status: active
plan_sections: [6, 13, 16, 17, 18]
owners: [agent]
---

# Objective

Generate a reviewable 1024×1024 campaign image with Workers AI, retain it as a private seven-day R2 draft with D1 provenance, and present it in the workbench as a differentiated external creative capability.

## Scope

- In-scope paths: bounded image prompt, Workers AI inference, media validation, R2 storage, D1 audit metadata, authorized image delivery, draft UI, inspectable orchestration/tool traces, and Salesforce Task relationship clarity.
- Explicitly out of scope: reference images, model selection, publishing, activation, and representing a generated draft as approved brand content.
- Prerequisites: existing AI, R2, D1, Access, and Worker bindings.

## Contracts affected

- Schemas: generated campaign image draft.
- Tools/actions: host-owned `generate_campaign_image` behavior; no new autonomous Salesforce write.
- Tiles/HXL: native generated-image draft card.
- External state: D1 migration, Worker deployment, one Workers AI generation, and private R2 object.

## Acceptance criteria

- [x] Only bounded, PII-free concepts generate images.
- [x] Output is validated as a 1024×1024 PNG before storage.
- [x] R2 objects are private and D1 records provenance, lifecycle, ownership, and seven-day expiry.
- [x] Per-user concurrency and the 100-image proof cap fail closed.
- [x] The workbench renders a generated draft and accurately labels its limitations.
- [x] Technical evaluators can inspect tool discovery, execution lifecycle, concise decision rationale, and sanitized request/response payloads without exposing private reasoning, credentials, confirmation material, or personal data.
- [x] Salesforce review Tasks use the native `WhatId` Campaign relationship without presenting a plain-text ID as the relationship.

## Verification

```text
pnpm verify:fast
pnpm verify
pnpm deploy:dry-run
```

## External mutations

- Apply D1 migration `0002_campaign_image_drafts.sql`, deploy through the repository build, generate one draft, and read back D1/R2 metadata without exposing prompt-sensitive data.
- Redeploy the corrected review Task Apex and read back its native Campaign relationship.

## Evidence

- Reports: `artifacts/reports/WU-009/`; `pnpm verify` passed all 12 gates with 12 Worker tests.
- Screenshots: `artifacts/evidence/WU-009/technical-trace-{chrome,edge}.png` and `technical-trace-detail-{chrome,edge}.png`; eight Chrome/Edge journeys passed.
- Deployment identifiers: Salesforce deployment `0AfjV000002mpQTSAY`; Apex test run `707jV000004OWkv`; D1 migrations `0001` and `0002` applied remotely.
- Read-back results: Salesforce regression suite passed 10/10 and asserts Task `WhatId` equals Campaign; a live Campaign-to-Tasks relationship query returned the meaningful review Task through the native child relationship with matching `WhatId`. D1 read-back returned both required tables and zero image rows before first live generation.
- Known limitations: Salesforce image attachment remains the next separately confirmed vertical change.

## Completion

- Final status: active
- Commit: pending
- Summary: pending
