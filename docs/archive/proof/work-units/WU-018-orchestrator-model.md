---
id: WU-018
title: Switch the orchestrator to gpt-oss-120b from a single model setting
status: active
plan_sections: [10, 16, 17]
owners: [agent]
---

# Objective

The orchestrator runs on `@cf/openai/gpt-oss-120b`, and the model is set in exactly one place.

## Scope

- `PROOF_DEFAULTS.orchestratorModel` becomes the only model setting. The `ORCHESTRATOR_MODEL` variable is removed from `wrangler.jsonc`, `wrangler.e2e.jsonc`, and the generated worker types.
- The Section 17 plan text and ADR-004 are updated.
- The tool-name repair restores a dropped MCP namespace prefix.
- Out of scope: routing changes and write-intent handling.

## Acceptance criteria

- [x] The Worker reads `PROOF_DEFAULTS.orchestratorModel`, and the invariant check rejects a wrangler model setting.
- [x] Live comparison and routing evidence are recorded in ADR-004.
- [ ] Production read-back after deploy.

## Known issue found during evaluation

A live run of "Save this campaign now" produced a reply claiming the campaign was saved, although the chat has no write tools. gpt-oss-20b showed the same kind of error. This is independent of the model change and is tracked as follow-up work.

## Verification

```text
pnpm verify
```
