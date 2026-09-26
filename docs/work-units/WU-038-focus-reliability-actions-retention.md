---
id: WU-038
title: Reliable drafting, email campaigns, chat action cards, readable context, 24-hour audit
status: active
plan_sections: [9, 15]
owners: [agent]
issue: 46
---

# Why

Production audits from 2026-09-26 showed two failures:

- **The Coastline push turn failed at its last step.** The four context and content tools succeeded, then the forced `update_focus` step failed with `AI_ToolChoiceViolationError`. gpt-oss-20b wrote the draft as text instead of emitting the large structured call.
- **The Coastline email turn timed out** on the same forced step. It had also skipped the restaurant, weather, and graph context, because the plan only matched "push".

Two more issues showed up alongside:

- A context card showed raw JSON: the Salesforce content agent had replied with a structured "confirm" message rather than a draft.
- The side panel carried review and save buttons, when approvals belong in the conversation.

## Changes

- **Drafts are saved from the answer.** Drafting and revision turns no longer force any tool call.
  - `draftIntent` marks a turn as a new draft (from a drafting plan, or a new campaign "in Salesforce") or a revision of the focus.
  - When the turn completes, `focusFromAnswer` reads the answer's bold title, first paragraph, and labeled lines (**Headline:** …, **Body:** …) into focus fields.
  - Revisions run with no tools. The system prompt asks for labeled lines.
  - The `update_focus` and `propose_salesforce_save` tools are removed.
- **Email campaigns:**
  - The Coastline plan (profile → weather → past pushes → content) now runs for Coastline or restaurant email and campaign requests too, with email-specific guidance.
  - There's a new Quickstart prompt and eval case, and Learn gets Try it buttons for it.
- **Action cards in the chat:**
  - The server keeps `suggestions`: *Save "…" in Salesforce?* after a draft is saved, and *Request a review of …?* after a readiness check on an open campaign.
  - The chat renders them as cards. Accepting one prepares the confirmation (with the permission check) through `POST /agent/suggestions/:id/accept`; dismissing uses `/dismiss`.
  - Asking for a review in chat prepares it directly.
  - The side review button and the Focus card's save button are removed; the Focus card shows its saved status instead.
- **Image generation** is a collapsed section in the Workspace.
- **Readable context:** `readableAgentText` never shows raw JSON. It uses the agent's own message or summary, describes an agent asking for confirmation in plain words, or falls back to a count. Cards also wrap long values.
- **Retention:**
  - Turn history and the confirmation audit are kept for **24 hours**.
  - Audit rows are pruned on every write and hourly by the cron, which moved from daily to hourly.
  - The History view, audit export (`retentionHours`), Learn, the runbook, and the plan are updated.

## Verification

- Worker tests (84): draft intent, answer parsing, the email plan, suggestions (review after readiness, save after drafting, accept, dismiss, cleared by New chat), and readable Salesforce results, including the confirm case.
- Unit tests (70). E2E in Chrome and Edge (30), including the review action card and the collapsed image workflow.
- `pnpm verify` passes.
