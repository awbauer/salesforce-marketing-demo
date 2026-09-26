---
id: WU-035
title: Session working set, phase 1 (records in any system, context from tools)
status: active
plan_sections: [9, 15]
owners: [agent]
issue: 46
---

# Objective

Phase 1 of issue #46. The workspace becomes the chat's **working set**: it starts empty with each new chat and fills from what the chat's tools return. Static sample tiles no longer appear in the UI or the prompt.

## Delivered

- **Contracts:**
  - `workingSet: { startedAt, cards, records }` replaces `tiles` in orchestrator state.
  - Records use a system-agnostic `RecordRef` (`system`, `objectType`, `recordId`), with a `CONNECTED_SYSTEMS` label registry. Salesforce is one system among several; restaurant data is already a second.
  - `WORKSPACE_CATALOG` lists the records that connected systems make available. It is kept separate from the working set.
- **Ingestion** (`apps/edge/src/working-set.ts`) is deterministic and never reads model text:
  - weather produces a weather card
  - the restaurant profile produces a restaurant card plus a Restaurant record in *Restaurant data*
  - graph tools produce evidence cards with tool-specific summaries
  - Salesforce tools produce summary, readiness (with the HXL presentation), draft, and signal cards
  - Salesforce records are opened when a tool's input or output names their id or a catalog record's name
  - failed results add nothing
- **Lifecycle:**
  - New chat calls `POST /agent/working-set/reset`.
  - The first message of any conversation also starts a fresh working set.
  - A pending confirmation and the chat's activity clear with it; History and the audit export keep everything.
  - Saved state from before this change is migrated on start.
- **Prompt:** lists the records open in this chat and the context gathered, and separately the catalog, labeled as not open, so the model acts on a catalog record only when the user asks for it.
- **Writes:** Create review request and campaign visuals target the Salesforce campaign open in the working set. The server refuses a confirmation for any other record (409). Confirmed writes add a **created** record (Task or ContentDocument).
- **UI:**
  - The *Workspace* panel shows Records grouped by system, each with a system badge, relation, tool, time, and a link only where the system has one.
  - Context cards show relative fetch times.
  - The empty state explains how the workspace fills.
  - Actions are disabled with a hint until a campaign is open.
- **Local development:** fixture Salesforce results go through the same ingestion path, labeled "Salesforce · local fixture".

## Verification

- Worker tests:
  - ingestion from real campaign-context and graph tool calls
  - Salesforce id and catalog matching
  - failed results
  - prompt wording
  - the reset route
  - writes refused without an open campaign
  - created records after execute
- Unit tests: contracts (empty initial state, system-agnostic refs), UI (generic record links, relative time), and the Workspace panel (grouping by system).
- E2E in Chrome and Edge: an empty workspace after New chat, a chat that opens the campaign and adds context cards, the created task appearing as a record, and the image and HXL fallback flows after opening the campaign.
- `pnpm verify` passes.
