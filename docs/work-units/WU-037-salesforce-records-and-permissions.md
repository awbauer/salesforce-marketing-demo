---
id: WU-037
title: Create and update Salesforce records from the workspace, with visible permission checks
status: active
plan_sections: [9, 10, 15]
owners: [agent]
issue: 46
---

# Objective

Drafts become real Salesforce records (campaigns, briefs, and email, push, or SMS messages), created or updated as needed in the system of record. Every write shows that Salesforce checked the user's permissions first, and explains which layer is responsible for what.

## Salesforce (deployed and tested in the proof org)

- **Objects:**
  - `Northstar_Brief__c` (a campaign lookup, objective, audience, channel, body, the draft's fields as JSON, draft id and version)
  - `Northstar_Message__c` (a campaign lookup, channel Email, Push, or SMS, subject or headline, preheader, body, send time, audience, and status Draft)
  - `Campaign.Northstar_Brand__c`
- **Apex actions:**
  - `NorthstarSaveCampaign`, `NorthstarSaveBrief`, and `NorthstarSaveMessage` create a record, or update it when a record id is given. A brief or message can create its campaign in the same write.
  - Each verifies the host-signed confirmation, is idempotent by key, writes `as user` with `WITH USER_MODE` queries, and reads back.
  - Updates change only confirmed fields.
- **Confirmation verifier:** `requireValidFor(action, subject, …)` binds a confirmation to the record being updated, its parent campaign, or `new`. The existing campaign-id checks are unchanged.
- **Permission check:** `NorthstarCheckWriteAccess`, a read-only action that reports, as the signed-in user:
  - the workbench permission set and Marketing User
  - object create or edit access and field-level security
  - `UserRecordAccess` edit for updates
  - each result as label, passed, and detail
- **Wiring:**
  - The Hosted MCP definition adds `save_campaign`, `save_brief`, `save_message`, and read-only `check_write_access`, which is host-only (not autonomous).
  - The permission set grants the new classes, object create and edit, field access, and Campaign create.
  - CI runs `NorthstarRecordActionsTest` too; 19 Apex tests pass, with 86–96% coverage on the new classes.

## Workbench

- **Planning:** `planFocusWrite` turns the focus into a write the server authors:
  - a campaign; or
  - a brief or message on the campaign the draft names in its Campaign field (a new one, with its Brand), or on the open Salesforce campaign.
  - Once saved, the focus links to its record (`focus.saved`), and later versions **update** that record.
- **One preflight path** (`prepareConfirmation`) serves the HTTP route, the policy router, and the model's `propose_salesforce_save` tool. It:
  - plans the write from the focus
  - calls `check_write_access` as the user (a fixture report locally)
  - refuses with the failing checks when a permission is missing
  - fails closed when the check is unavailable
  - binds the write and the report into the confirmation and its hash
- **Chat:** "save it" or "create it" with a draft prepares the write and replies with what will be written and which checks passed. Drafting requests that say "in Salesforce" plan `update_focus` → `propose_salesforce_save`. The model never writes.
- **Execute:** the Apex inputs come from the confirmed write; after read-back, the record (and any new campaign) appears in Records as created or updated.
- **UI:**
  - The Focus card offers *Create … in Salesforce*, *Update in Salesforce*, or *Saved to Salesforce*.
  - The confirmation card shows the record, its values, the draft version, the **Salesforce permission check** (each check with its result), and **Who checks what**.
  - A success banner links to the saved record.
- **Learn:**
  - Governance is now permissions, confirmations, and kill switches, with a five-step diagram and a who-checks-what table.
  - Salesforce covers the new objects and actions.
  - The workspace and routing lessons are updated, and the Concepts quiz asks who decides whether you may write.

## Verification

- Apex: 19 tests pass in the proof org (create, update, replay, campaign created alongside, unsigned or wrong-subject refusal, permission report).
- Worker tests: write planning, permission-report parsing, and the full local flow (permission check → confirm → created message and campaign → revision → update of the same record).
- Unit tests: confirmation details (record plan, checks, who checks what) and the catalog contract.
- E2E in Chrome and Edge: draft → revise → "create it" prepares the save with the permission check → confirm → message and new campaign created → revise → update the same record.
- `pnpm verify` and `pnpm sf:metadata:check` pass.

## Production catalog incident and prevention

- On 2026-09-26, the proof org metadata read-back and active Salesforce custom-server screen contained all 18 approved tools, but Cloudflare's synchronized upstream catalog still exposed the earlier 13. The email-campaign quickstart therefore reached confirmation preparation but could not discover `check_write_access`.
- The connector now fails closed unless all governed tools are discovered; a partial catalog is no longer labeled ready.
- The permission preflight distinguishes an incomplete catalog from a failed or malformed Salesforce response and gives the operator the correct recovery action.
- `pnpm test:production:chat` now verifies the complete catalog and invokes the real, read-only Salesforce permission action through an authenticated HTTP diagnostic endpoint before exercising chat. This covers the production path without UI automation.
- Salesforce metadata deployment is not sufficient proof of runtime availability. After an MCP definition changes, refresh the active Salesforce Hosted MCP server, synchronize the Cloudflare portal, and run the browserless production test.
- Live read-back on 2026-09-26 showed the Salesforce custom server active with 18 tools while the Cloudflare upstream remained ready with only 13. Two capability synchronizations completed without changing that count, narrowing the remaining recovery boundary to the Cloudflare server's upstream OAuth/catalog session.
- `pnpm verify` passed all 12 gates after the incident fix: 70 unit tests, 87 Worker tests, the 18-tool Salesforce metadata contract, documentation and invariant checks, evaluation, typechecking, linting, formatting, and production builds.
