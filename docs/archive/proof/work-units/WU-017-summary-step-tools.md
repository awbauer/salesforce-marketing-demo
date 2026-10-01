---
id: WU-017
title: Summary steps always produce text after a Salesforce tool result
status: active
plan_sections: [10, 13, 16, 17]
owners: [agent]
---

# Objective

After a governed Salesforce tool returns, the orchestrator writes a summary instead of attempting another tool call or running out of output tokens.

## Root causes (from the WU-016 production trace)

- Workers AI does not enforce `toolChoice: "none"`. With the tool list still offered on the summary step, gpt-oss emitted a malformed tool call (`…summarize_campaign<|channel|>analysis`), which failed with `AI_NoSuchToolError`.
- No `maxOutputTokens` was set, so Workers AI applied its default of 256 output tokens. gpt-oss reasoning used the whole budget and the step ended with `length` and no text.
- The model sometimes leaks its channel markup into a tool name on any step, including the forced step.
- The forced step was fully buffered, so its reasoning appeared with zero duration in the trace.

## Behavior

- Text-only steps (after a forced tool, and the final allowed step) receive no tools (`activeTools: []`), and a forced step only receives its required tool.
- `maxOutputTokens` is 4,096 for the turn. Forced tool steps stay capped at 1,024.
- Tool names that contain leaked channel markup are repaired to the offered tool name on every step. A forced step that calls any other tool is recovered from reasoning or retried.
- Forced-step reasoning now streams live, and only the rest of the step is held for validation, so trace timings are real.
- The trace records an invalid tool call once, and marks a tool name outside the governed catalog as an error.

## Acceptance criteria

- [x] Live A/B with the production tool names and a realistic tool result: the previous settings failed 4 of 20 turns with `tool-calls,length` and no text. The new settings passed 119 of 120 turns (60 with per-turn failure details, all passing).
- [x] Unit and worker coverage for step tool settings, name repair, live reasoning, retry, and the trace changes.
- [ ] Production read-back after delivery.

## Verification

```text
pnpm test:unit
pnpm test:worker
pnpm verify
```
