---
id: WU-022
title: Turn history with interpretation, tool use, and outcome
status: active
plan_sections: [10, 13, 16, 17]
owners: [agent]
issue: 24
---

# Objective

Evaluators can open a History view listing every chat turn: the utterance, how the orchestrator interpreted it, each tool call with its input, result, and timing, and the turn's outcome. Resolves GitHub issue #24.

## Behavior

- **Capture:** the turn tracer records reasoning, answer text, and tool calls (input, output, status, timing), each bounded to 4,000 characters of text. The orchestrator stores one `TurnRecord` per turn for:
  - model turns
  - policy-routed turns (save, publish, and similar)
  - catalog-unavailable turns
  - local fixture turns
- **Interpretation:**
  - the route (model, needs confirmation, blocked action, catalog unavailable, or local fixture)
  - the required tool for intent-routed turns
  - a plain-language explanation
  - the model's sanitized reasoning
- **Storage:** records live in the user's agent Durable Object SQLite (`northstar_turn_history`), so no D1 migration is needed and history is isolated per user. Records are kept for 14 days (Section 17 transcript retention), capped at 200, and survive "New chat". A failure to record never affects the turn.
- **Privacy:** before storage, emails, phone numbers, bearer tokens, and JWTs are redacted, along with fields named like secrets, confirmation material, idempotency keys, or base64 payloads. Each tool value is capped at 6,000 characters.
- **API:** `GET /agent/turns` returns the caller's turns, newest first, with the retention period.
- **UI:** a History view (rail and header), with filters for All, With issues, Used tools, and Policy routed. Each expanded turn shows:
  - interpretation, model, routing, steps, and tokens
  - reasoning
  - tool calls with their input and result
  - outcome, including recovery messages and failures
  - the answer

## Acceptance criteria

- [x] Worker tests cover record building, redaction, bounding, interpretation text, and the endpoint.
- [x] E2E in Chrome and Edge: a local fixture turn and a policy-blocked turn appear with their interpretation, reasoning, answer, and filters.
- [ ] Production read-back of a live model turn with a Salesforce tool call after deploy.

## Verification

```text
pnpm verify
pnpm exec playwright test tests/e2e/workbench.spec.ts
```
