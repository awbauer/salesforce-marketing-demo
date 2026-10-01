---
id: WU-054
title: Guided setup wizard and demo run-sheet
status: active
owners: [agent]
---

# Objective

- A person who clones the repository can run one command, answer questions about the client and the demo, and get a working, tailored instance plus a run-sheet for presenting it.

## Scope

- In-scope paths: `scripts/workbench-init.mjs`, `scripts/make-demo-script.mjs`, `scripts/lib/init.mjs`, `scripts/lib/init.test.mjs`, the `workbench:init` and `workbench:script` scripts.
- Explicitly out of scope: deployment (WU-055), building new packs from the wizard.

## Behavior

`pnpm workbench:init` asks, in order:

1. Who the demo is for: internal, or an external client discussion (adds the fictional-data banner).
2. The client's industry (an industry pack).
3. The sample client profile: brand name, the real client's name if different, region, language, brand voice, customer segments, products, rules every message must follow.
4. The use cases to show (titles read from the catalog).
5. The chat model: local Ollama (detected; offers `ollama pull`), another OpenAI-compatible endpoint, Workers AI, or Bedrock; and the image provider.
6. Salesforce: fixtures, or a sandbox (MCP URL and a sample Campaign id).
7. Where it will run: local, Cloudflare or AWS.
8. Whether to have the local model invent fitting account and campaign names.

It then writes `workbench.profile.json`, optional `data/instance-dataset.json`, the real client name into `.config/blocked-words.local` (mode 600), compiles the profile, and writes `.workbench/demo-script.md`. All of these are ignored by Git. `--answers file.json` runs it without prompts; `--root`, `--skip-build`, `--verify` and `--force` are flags for tests and automation.

## Acceptance criteria

- [x] Answers validate against a schema; use cases outside the pack, and a sandbox without an MCP URL, are rejected (`scripts/lib/init.test.mjs`).
- [x] The real client name never enters the profile; it is written only to the blocked-words list (test).
- [x] Personalization accepts valid JSON, including fenced output, and rejects wrong counts, repeats, PII-shaped text and blocked values (tests); on any failure the pack's own names stay.
- [x] The interactive flow was driven end to end through a pseudo-terminal with default answers and wrote a valid profile.
- [x] A restaurant instance was generated, type-checked and booted: its graph has restaurant data and no wealth data.
- [x] `pnpm verify` passes (14 gates).
- [ ] A person-in-the-loop run of the interactive wizard on a machine with Ollama (not available in the authoring container), including the `ollama pull` and personalization steps.

## Verification

```text
pnpm exec vitest run --config vitest.config.ts scripts/lib/init.test.mjs
node scripts/workbench-init.mjs --answers <file> --root <tmp> --skip-build
pnpm verify
```

## Evidence

15 unit tests. The pseudo-terminal run printed the profile path, the `pnpm dev` URL and the run-sheet path and exited 0. The restaurant instance run-sheet rendered every selected use case with the brand substituted.

## Limitations

- Personalization renames accounts and campaigns only. The restaurant menu and locations and the wealth clients are fixed fictional data inside their modules.
- The run-sheet's talk track is the catalog's prompts and notes; it is not tailored by a model.
- The ollama pull and personalization paths were exercised only through their pure functions and injected fetches, not against a live Ollama.
