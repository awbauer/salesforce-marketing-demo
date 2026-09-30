---
id: WU-052
title: Instance profile, model providers, and an account-free local default
status: active
owners: [agent]
---

# Objective

- A fresh clone runs locally with no Cloudflare, AWS or Salesforce account, using Ollama by default.
- Chat and image models come from one validated instance profile, with Workers AI and Bedrock (chat) as options.

## Scope

- In-scope paths: `packages/contracts/src/profile.ts`, `apps/edge/src/models.ts`, `apps/edge/src/orchestrator.ts`, `apps/edge/src/index.ts`, `scripts/build-profile.mjs`, `scripts/check-invariants.mjs`, `wrangler.jsonc`, `templates/cloudflare/`, `profiles/`, ADR-009.
- Explicitly out of scope (later work units): industry packs and removing brand names (WU-053), the init wizard (WU-054), deployment templates and the playbook README (WU-055), Bedrock image generation.

## Acceptance criteria

- [x] `resolveChatModel` builds Ollama, OpenAI-compatible, Workers AI and Bedrock models; Workers AI without a binding fails with a typed error.
- [x] The orchestrator names no model id; the trace and history record the profile's model.
- [x] `wrangler.jsonc` has no account ids, routes or AI binding; the Cloudflare config is a placeholder template.
- [x] The placeholder image is a valid 1024×1024 PNG, stable per prompt.
- [ ] `pnpm verify` passes.
- [ ] Live model turn against a running Ollama recorded below (needs a machine with Ollama; not available in the authoring container).

## Verification

```text
pnpm typecheck && pnpm test:unit && pnpm test:worker
pnpm verify
```

## Evidence

Worker tests: `apps/edge/src/models.worker.test.ts` (provider resolution, reachability, placeholder PNG inflates to the expected size).

## Limitations

- Local-mode tool turns that need Salesforce tools report the catalog as unavailable rather than substituting fixtures; the fixtures still answer the scripted flows.
- Local models are unmeasured for tool-calling quality.
