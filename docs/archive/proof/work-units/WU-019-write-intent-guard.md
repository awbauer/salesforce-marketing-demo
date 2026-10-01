---
id: WU-019
title: Chat write and forbidden-action requests never reach the model
status: active
plan_sections: [3, 10, 16, 17]
owners: [agent]
---

# Objective

A chat request to save, create, or change a Salesforce record, or to publish, send, activate, delete, suppress, change buyer groups, or reveal contact details, gets a fixed, accurate reply without a model call. The model can no longer claim that a write happened.

## Evidence that prompted this

During the WU-018 live routing evaluation, gpt-oss-120b answered "Save this campaign now" with "The campaign has been saved and is ready for activation." The chat has no write tools, and nothing was saved. gpt-oss-20b called a draft tool for "Create a review task".

## Behavior

- `classifyPolicyIntent` (contracts) sorts the latest user message into `confirmation-required`, `unsupported`, or neither.
  - Negated requests ("do not publish") and advisory questions ("When should we send it?") pass through to the model.
  - Describing a future send ("an email to send next week") passes through too.
- `onChatMessage` runs the classifier before any model or MCP call, in production and locally, and streams the matching `POLICY_RESPONSES` text through the turn tracer.
- The turn trace records the route (`model`, `confirmation-required`, `unsupported`, or `catalog-unavailable`). The UI labels policy turns as handled without a model call.
- The catalog-unavailable reply now also goes through the tracer.
- `scripts/run-evals.mjs` uses the same classifier for its write and unsupported routes.

## Acceptance criteria

- [x] The routing evaluation's write and unsupported cases, plus extra positive and negative prompts, are covered by unit tests.
- [x] E2E in Chrome and Edge: "Save this campaign now" gets the confirmation-flow reply and a policy-router trace. "Publish and send the campaign" is refused.
- [x] Deterministic routing evaluation stays at 20 of 20.
- [ ] Production read-back after deploy.

## Verification

```text
pnpm verify
pnpm exec playwright test tests/e2e/workbench.spec.ts
```
