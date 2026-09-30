---
id: WU-024
title: Reviewable image variants with select and reject
status: active
plan_sections: [10, 15, 17]
owners: [agent]
---

# Objective

For Phase 4, one campaign produces reviewable variants that an evaluator can select, reject, or revise before a separately confirmed attachment.

## Behavior

- **List:** `GET /agent/images?campaignId=` returns the caller's unexpired variants for that campaign, newest first (at most 24), validated against `GeneratedCampaignImageSchema`.
- **Reject:** `POST /agent/images/{id}/reject` moves an unexpired draft to `rejected`. It refuses attached, rejected, or expired drafts, and a draft with a pending attach confirmation. A rejected draft cannot be preflighted for attachment.
- **UI:**
  - The variant gallery loads persisted drafts, so a reload keeps the review state.
  - Generating adds a variant, and editing the concept before generating gives a revised variant.
  - The selected variant shows its concept, provenance, Attach to campaign, and Reject variant.
  - Rejected variants are greyed out and labelled, with no attach action.
- Contracts: the image lifecycle now includes `rejected`.

## Acceptance criteria

- [x] Worker tests: list and reject, rejected drafts cannot be attached, repeat rejection is refused, and an invalid campaign returns an empty list.
- [x] E2E in Chrome and Edge: persisted gallery, selection, rejection, and no attach action on a rejected variant.
- [ ] After deploy: generate two live variants, reject one, and attach the other with read-back.

## Verification

```text
pnpm verify
pnpm exec playwright test tests/e2e/workbench.spec.ts
```
