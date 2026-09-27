---
id: WU-048
title: Show a confirmed write's work while it runs
status: complete
plan_sections: [9, 15]
owners: [agent]
---

# Why

Andrew Bauer: clicking **Confirm** showed nothing until the write finished, even though a Marketing Cloud agent call can take many seconds.

## Changes

- **Live progress in agent state.** `writeProgress` in `OrchestratorState` lists a confirmed write's steps, each with a status (pending, active, done, skipped, or failed), a detail, and timings. The Worker updates it at each milestone, and the browser receives each update immediately over the agent WebSocket.
- **Steps per write:**
  - Every write starts with the confirmation check and ends with the read-back and the memory record.
  - A **brief or campaign** adds a check for an earlier attempt, then the Campaign Creation agent call with its actions.
  - A **review task, image, or inventory case** adds signing, then the Apex action run as the user.
  - A linked earlier attempt, a recovered agent timeout, and local fixtures show up as details and skipped steps.
  - A failure marks the step where the write stopped, with the error.
- **One entry point.** `runConfirmedWrite` wraps all three write paths. The review-task and image path moved into `executeApexWrite`.
- **UI:**
  - **Confirm** disables both buttons, becomes *Working…*, and shows the live steps in the card, kept in view as they arrive.
  - Afterwards, a collapsible **Behind the scenes** record shows every step and its duration. It opens by itself on failure.
- **Fix:** each state broadcast re-delivered the pending confirmation, and the card's scroll-into-view effect re-ran every time, pulling the view back to the card's top. The effect is now keyed on the confirmation id.

## Acceptance criteria

- After **Confirm**, the steps appear right away and update as the write progresses.
- The finished steps and their timings remain available after the write completes or fails.

## Verification

```text
pnpm verify
pnpm test:e2e
```

## External mutations

None.

## Evidence

- The E2E test holds the execute response open, checks that the running panel is visible and in view with the Apex step named, then checks the finished record (`artifacts/evidence/WU-048/`). It passed 3 repeats in Chrome and Edge.
- A Worker test checks a local review task's recorded steps: confirm done, sign and call skipped (no Salesforce locally), read-back and memory done.
