---
id: WU-020
title: Attach a selected generated image to the Salesforce Campaign after confirmation
status: active
plan_sections: [10, 13, 16, 17]
owners: [agent]
---

# Objective

An evaluator can attach a generated image draft to the campaign in Salesforce. The attachment happens only after a same-user, five-minute confirmation, and Salesforce's read-back must match the confirmed image. This is the third Section 17 write, `attach-generated-image`, and it completes the image workflow.

## Scope

- Salesforce:
  - `NorthstarAttachCampaignImage`, a global Apex Invocable Action
  - the `ContentVersion.Northstar_Idempotency_Key__c` field
  - evaluator permission set access
  - the `attach_campaign_image` Hosted MCP tool
  - Apex tests
- Contracts: the confirmation action and optional `imageId`/`contentHash` fields, the `attached` image lifecycle, a tool catalog entry marked non-autonomous, and the curated host allowlist (14 tools).
- Edge:
  - Attach confirmations are bound to one unexpired draft owned by the same principal and workspace for the same campaign.
  - The summary is written by the server, and the request hash covers the image ID and content hash.
  - On execute, the Worker reloads the draft from R2, re-verifies its SHA-256 hash, calls the tool, checks the read-back, and marks the draft `attached`.
- Web: an "Attach to campaign" button, a confirmation card for each action (showing the image and its hash), and a success banner linking to the Salesforce file.
- Out of scope: selecting between several variants, and attaching to the content asset library.

## Salesforce behavior

- Verifies the host-signed confirmation for `attach-generated-image`.
- Rejects non-PNG input, images over 3 MB, and bytes whose SHA-256 does not match `contentHash`.
- Creates one `ContentVersion` with `FirstPublishLocationId` set to the Campaign. The alt text is stored as the file description.
- Replays by idempotency key without creating a duplicate.
- Reads back the version, the stored MD5 checksum (compared with the input bytes), a PNG file extension, and the `ContentDocumentLink` to the Campaign.

## Acceptance criteria

- [x] Apex tests: attach once and replay idempotently with read-back, refuse a hash mismatch without writing, and refuse a missing confirmation without writing.
- [x] Worker tests:
  - preflight binds the draft and its hash, and execute attaches and marks the draft `attached`
  - reusing an attached draft is rejected
  - bytes changed after confirmation are refused
  - unknown drafts and drafts for another campaign are rejected
- [x] E2E in Chrome and Edge: attach, confirmation card, success banner, and Salesforce file link.
- [ ] Salesforce CI check-only deploy and Apex tests pass on the pull request.
- [ ] After merge and deploy: the Hosted MCP server lists 14 tools, the Cloudflare MCP portal and Worker discover `attach_campaign_image`, and one confirmed live attachment reads back on Campaign `701jV000004GglIQAS`.

## Risks

- The Hosted MCP payload size for a base64 image (about 2 MB for a typical 1024×1024 PNG) has not been proven live. If Salesforce rejects it, the Worker returns a structured failure and nothing is marked attached.
- The Cloudflare MCP portal may cache the previous tool schema. If the new tool is not discovered, re-sync the portal.

## Verification

```text
pnpm verify
pnpm exec playwright test tests/e2e/workbench.spec.ts
```
