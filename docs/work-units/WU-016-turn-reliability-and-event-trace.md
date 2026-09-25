---
id: WU-016
title: Reliable chat turns with a step-by-step event trace
status: active
plan_sections: [10, 13, 16, 17]
owners: [agent]
---

# Objective

Every chat turn ends with visible assistant text, and the technical trace shows each model and tool lifecycle event in order: turn start, step start and finish (finish reason, token usage), reasoning start and end (with the sanitized reasoning), text start and end, tool call start, tool input, tool output or error, stream errors, timeouts, and the final outcome, each with its time from the start of the turn.

## Root causes addressed

- About one in five forced tool-call steps on `@cf/openai/gpt-oss-20b` wrote the tool arguments as JSON at the end of the model's reasoning instead of emitting a structured tool call. The step then finished with `stop`, the Salesforce tool never ran, and the turn ended empty. Reproduced directly against Workers AI in 3 of 15 raw calls and 4 of 20 `streamText` turns.
- `streamText` used `timeout: 45_000`, a 45-second total budget covering model reasoning, Salesforce agent execution, and the summary step. Slow Salesforce calls hit it, which emitted an `abort` chunk and ended the turn with no text ("no response").
- `toUIMessageStreamResponse()` forwarded provider and tool-loop errors as an `error` chunk masked as "An error occurred." The chat agent treats that chunk as fatal, so the client showed "The turn was interrupted" with no cause.
- Turns without a routed tool could spend all four steps calling tools and end on a tool step with no text.
- An empty model summary after a successful tool result left an assistant message with no text.

## Scope

- In scope: `apps/edge/src/orchestrator.ts`, `apps/edge/src/turn-trace.ts`, the `TurnTrace` contract, the web trace UI, and unit, worker, and e2e coverage.
- Out of scope: Salesforce writes, model selection, retention, tool allowlists.

## Contracts affected

- Schemas: `TurnTraceSchema` / `TurnTraceEventSchema`, persisted as one `data-turn-trace` message part per turn.
- External state: none.

## Behavior

- `forcedToolCallMiddleware` (`apps/edge/src/forced-tool-middleware.ts`) wraps the orchestrator model. For forced tool-call steps only, it caps output at 1,024 tokens so a looping reasoning stream ends quickly, buffers the short step, and turns trailing reasoning JSON that has the tool's required keys into a structured tool call. When no call can be recovered it retries once. Live A/B against Workers AI: 16 of 20 turns succeeded without it and 40 of 40 with it, including 4 recovered calls.
- The timeout is now structured: 150 seconds total, 60 seconds between model chunks, and 120 seconds per tool.
- The last allowed step is forced to answer in text.
- Stream errors, timeouts, setup failures, and empty completions are turned into an explanatory assistant message that names the cause and points to the trace. The cause is also recorded as a trace event. A turn the user stops gets no recovery message.
- Error messages are cut to 240 characters with credentials removed. Reasoning text is shown with emails, phone numbers, and tokens redacted inline.
- Messages saved before this change fall back to an untimed timeline built from their message parts.

## Acceptance criteria

- [x] A forced Salesforce tool call that leaks into model reasoning still executes.
- [x] A timed-out, errored, or empty turn shows an explanatory assistant message instead of an empty turn or the interruption banner.
- [x] The trace lists reasoning, text, and tool input and output events in order, with times and sanitized payloads.
- [x] The trace uses the existing Northstar trace styling.
- [x] `scripts/test-production-chat.mjs` asserts a completed server trace with no recovery fallback.
- [ ] Production browserless reproduction passes after delivery.

## Verification

```text
pnpm test:unit
pnpm test:worker
pnpm exec playwright test tests/e2e/workbench.spec.ts
pnpm verify
```
