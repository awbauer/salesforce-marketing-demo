---
id: WU-036
title: Workspace focus (phase 2 of #46) and a connected Northstar and Coastline graph
status: active
plan_sections: [9, 15, 16]
owners: [agent]
issue: 46
---

# Objective

- **Phase 2 of #46:** the chat builds a **focus**, a structured, versioned draft that revisions, references, and confirmed writes all act on.
- **Graph remodel:** Coastline Kitchen becomes a brand under Northstar with its own restaurant entities, and pushes connect to consent, content, and segments over a mobile app channel.

## Knowledge graph v2 (`northstar-kg-v2`)

- **Brands:** `Brand` Northstar is the parent. `Brand` Coastline Kitchen has a `PART_OF` relationship to Northstar. Campaigns `BELONGS_TO` a brand, and brand rules are each `RULE_OF` a brand (Coastline has its own promotion rules).
- **Channels:** email, SMS, and **mobile app** (push notifications). Each channel has a marketing consent scope `FOR` it.
- **Restaurant system entities**, from `packages/knowledge-graph/src/coastline.ts`, the single source that both the graph and the restaurant-data tool read:
  - five `Location`s (`OPERATES`), one `Menu` (`MENU_OF`, `SERVES`), and `MenuItem`s (`ON_MENU`, `AVAILABLE_DURING` dayparts)
  - brand `FAVORITE`s
  - ids are shared with the restaurant profile tool
- **App audiences:** one `Segment` per location (`NEAR`), with aggregate push consent on `HAS_CONSENT {optedIn, coverageRate}`. There are no individual records.
- **Coastline campaigns:** Weather Moments, Morning Fuel, and Late-Night Cravings. Each is `ON` the mobile app channel, `TARGETS` the location segments, and has a brief and push content assets checked against brand rules.
- **Every push send** links to:
  - its campaign (`PART_OF`) and content (`USED`)
  - its segment (`SENT_TO`) and consent (`SENT_UNDER`)
  - the channel (`ON`)
  - its location, daypart, weather, and featured item
- **Tools:**
  - `check_consent_coverage` handles B2B personas and app-segment aggregates, and accepts `mobile-app` (or `push`).
  - `find_similar_past_pushes` also returns each item's push content and the location's consented app audience, with `USED` and `SENT_TO` → `HAS_CONSENT` evidence paths.
  - Overlap and lineage cover Coastline campaigns.
- **Seeding:** prod Aura was reseeded with `--reset`, which now removes every earlier demo version. The read-back was 1,657 nodes and 14,198 relationships. `pnpm kg:parity`, including the new Coastline cases, matches for every tool, and the explorer's live check matches too.

## Focus (phase 2)

- **Contracts:** `workingSet.focus` holds a `FocusItem` (kind, current version, and up to 20 versions). Each version has a title, summary, labeled fields, a change note, the context cards it was built from, and a time.
- **Local tool `update_focus`** (`apps/edge/src/focus.ts`): saves a draft or a revision. A revision of the same kind becomes the next version; a different kind starts a new focus. It changes only the workspace.
- **Routing:**
  - Drafting plans end with `update_focus`; the push plan is profile → weather → past pushes → content → focus.
  - With a focus, a revision request ("make it warmer") routes straight to `update_focus`.
  - Operators can turn it off with `DISABLED_TOOLS`.
- **Prompt:** leads with the current focus as the draft that revisions and saves apply to, and requires drafts and revisions to be saved to it.
- **Policy router:** a chat write request names the focus draft in its reply.
- **Writes:**
  - *Save to Salesforce as brief* on the Focus card creates a confirmation whose brief text the server writes from the focus. It records the focus id and version and includes them in the request hash.
  - Review requests name the focus version.
  - A confirmed save marks the campaign record **updated**.
- **UI:** the Focus card at the top of the Workspace shows the kind, a version picker, fields, change notes, and what the draft was built from. Its action appears only on the current version. The confirmation card shows the draft and version, and a success banner confirms the saved brief.
- **Local development:** drafting and revision prompts create and revise a fixture draft through the same focus path.

## Verification

- Unit tests:
  - graph connectivity (every push links to campaign, content, segment, consent, and channel; Coastline under Northstar)
  - consent from segment aggregates
  - push content and audience
  - the Focus card
  - contracts
- Worker tests: focus versioning, the prompt, brief text limits, a focus-bound save marking the campaign updated, push and revision plans, and all existing flows (75).
- Live: seed read-back, graph tool parity, and explorer parity against prod Aura.
- E2E in Chrome and Edge: draft → revise to v2 → a chat write request names the draft → save as brief with confirmation → campaign shows "Updated". Graph explorer counts are updated.
- `pnpm verify` passes.
