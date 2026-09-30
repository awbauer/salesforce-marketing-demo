---
id: WU-030
title: Keep conversation context for follow-ups without reviving stale evidence
status: active
plan_sections: [10, 16]
owners: [agent]
---

# Objective

Follow-ups such as "looks good, create it" understand what "it" refers to, while the WU-014 protection against stale claims contaminating new Salesforce evidence stays in place.

## Cause

WU-014 sent the model only the latest user message, so every turn started with no memory of the conversation.

## Behavior

- The model receives a bounded window of the current chat: the last 8 messages, starting at a user message and ending at the latest one.
- Earlier assistant replies keep only their text. Tool results, reasoning, and trace data from earlier turns never re-enter the prompt.
- The system policy treats earlier replies as unverified context. The model must call governed tools again before restating Salesforce facts, and must point write requests to the confirmation actions.
- Follow-up write commands at the end of a message ("create it", "schedule it now", "build this in Salesforce") are handled by the policy router without a model call.
  - The reply names what "it" refers to when the previous reply had a title (a heading, a fully bold first line, or a "Draft …" line).
  - Refinements such as "make it shorter" and "can you create it with a warmer tone?" still reach the model.
- Routing and policy decisions still key off the latest user message. "New chat" clears the window.

## Evidence

- In a live check with gpt-oss-20b, where the history held a push-campaign draft followed by "Looks good, create it", the model now saw the draft. One run correctly identified "it" and declined to create it, one redrafted the campaign, and one returned no text under the test's 1,024-token limit.
- That inconsistency is why write follow-ups now go through the deterministic policy route.

## Acceptance criteria

- [x] Worker tests: the window includes prior turns, strips earlier replies to text, is bounded, and starts at a user message.
- [x] Contract tests: follow-up write commands route to confirmation, refinements do not, and titles are extracted only from real titles.
- [x] E2E in Chrome and Edge: "Looks good, create it" after a turn gets the confirmation-flow reply.

## Verification

```text
pnpm verify
pnpm exec playwright test tests/e2e/workbench.spec.ts
```
