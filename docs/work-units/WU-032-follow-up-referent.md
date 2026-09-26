---
id: WU-032
title: Anchor follow-ups to the previous reply, not workspace records
status: active
plan_sections: [9, 15]
owners: [agent]
---

# Objective

"Looks good, create this brief" after a drafted push campaign must build the brief from that draft.

## Observed failure (production, 2026-09-26 02:44 UTC)

The conversation window from WU-030 was live, and the forced tool was correct (`draft_campaign_brief`). But the model's reasoning chose the workspace record reference "Fall loyalty reactivation" as "this brief". It then sent Salesforce a brief it invented for that record. The system prompt ended with a list of record references, and nothing told the model which one "this" meant.

## Change

- `isFollowUpReference(prompt)` detects short messages that point back: it, this, that, these, those, above, same.
- On a follow-up with an earlier assistant reply, the system prompt names that reply by title (`referentFromReply`). It tells the model to build every tool input from that reply's content and never to substitute a workspace record.
- Workspace record references are now labeled as background that is never what "this" or "it" means.

## Acceptance criteria

- [x] Worker tests cover detection, the anchored prompt, and no guidance on fresh requests.
- [x] `pnpm verify` passes.
