---
id: WU-046
title: Reopen remembered work in the workspace (phase 3 of #46)
status: complete
plan_sections: [9, 15]
owners: [agent]
issue: 46
---

# Why

Issue #46 made the workspace the chat's working set, in three phases:

- **Phase 1** (WU-035): records and context come from tool results.
- **Phase 2** (WU-036 and WU-038): the focus.
- **Phase 3:** reopen past work from connected systems and long-term memory.

WU-039 added memory and recall, but a recalled item stayed a card in the chat. It couldn't be picked up again.

## Changes

- **Reopen** on each item in History → Memory (`POST /agent/memory/:id/reopen`).
  - A remembered draft becomes the focus again, at its remembered version, with the change note "Reopened from memory (source, date)".
  - For a decision, the draft it saved becomes the focus.
  - The records the memory links to join **Records** with the new relation `remembered`, shown as *Remembered · from memory*.
- **Memory is treated as possibly stale:**
  - Reopening never marks a focus as saved.
  - A remembered campaign is not a write target until the chat reads it from Salesforce again (`openCampaign`).
  - The prompt says each remembered record was "reopened from memory, not re-read".
  - A later read replaces the remembered entry.
- **Only the user can reopen.** It's a Memory-tab action, not a model tool, and the audit export records each reopen.
- **Learn:** the long-term memory, workspace, orchestrator, observability, and governance sections teach reopening.

## Acceptance criteria

- In a new chat, Reopen on a remembered draft shows it as the workspace focus with its provenance.
- A reopened decision's Salesforce records appear as *Remembered*, and review or image writes stay disabled until the campaign is read again.
- Reopening is audited; an unknown memory id returns 404.

## Verification

```text
pnpm verify
pnpm test:e2e
```

## External mutations

None.

## Evidence

- Worker tests cover the focus from a draft or a decision, remembered records that aren't a write target until re-read, the audited route, and the 404.
- The E2E memory test remembers a draft, starts a new chat, recalls it, reopens it (`artifacts/evidence/WU-046/`), and forgets it, in Chrome and Edge.
- With phases 1–3 done, #46's acceptance criteria are covered by WU-035's tests (ingestion, reset, catalog separation, system-grouped records, write gating) and this unit.
