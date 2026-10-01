---
id: WU-053
title: Industry packs, profile-driven brand names, and removal of the proof-era identity
status: active
owners: [agent]
---

# Objective

- The repository carries no client, org or account identity from the proof it grew out of.
- An industry pack plus the instance profile decide the vocabulary, vertical modules, tools, prompts, use cases and screens.

## Scope

- In-scope paths: `packages/industry-packs/`, `packages/contracts/src/{pack,brands,profile}.ts`, `packages/knowledge-graph/src/{dataset,tools,restaurant,wealth}.ts`, `apps/edge/src/`, `apps/web/src/`, `salesforce/`, `scripts/{build-profile,check-template}.mjs`, docs.
- Explicitly out of scope: the init wizard (WU-054), deployment templates (WU-055), industry-specific vertical modules beyond restaurant and wealth management.

## Changes

- Seven packs: `composite` (full tour), `retail`, `restaurant` and `financial-services` (vertical modules), `healthcare-payer`, `b2b-technology`, `travel-hospitality` (core flows with the industry's vocabulary).
- `buildDataset({ pack })` swaps the vocabulary and builds the restaurant and wealth data only when the pack enables them. Tools that need a module are filtered out when it is off (`TOOL_MODULE`); graph tours, domains and use cases follow the pack.
- Brand names come from the profile (`PARENT_BRAND`, `RESTAURANT_BRAND`, `WEALTH_BRAND`); the system prompt carries the client, industry context, voice and compliance rules; routing patterns use the restaurant brand.
- Names: Northstar → Workbench, Coastline → restaurant, Harborstone → wealth (identifiers, ids, files, Apex, metadata); `PROOF_DEFAULTS` → `DEFAULTS`; the org-specific Salesforce campaign id → a fixture id (`SAMPLE_CAMPAIGN_ID`, overridable by `salesforce.sampleCampaignId`).
- Apex store lookup no longer depends on a brand name: managers are found by `Department = 'Store <city>'`.
- Proof-era plan, work units 001–051, ADR-001–008 and gate reports moved to `docs/archive/proof/`. `AGENTS.md` and the guides use role-based wording. `salesforce.yml` is manual (`dry-run` by default).
- `pnpm template:check` gate: no tracked instance files, no proof-era names outside the archive, every pack and shipped profile valid.
- `apps/web/public/evals/latest.json` had its names scrubbed with the same scripted rename; its numbers are from the proof-era live run and are not re-measured.

## Acceptance criteria

- [x] `buildDataset` is valid for every pack (unique ids, no dangling relationships, the pack's vocabulary present, vertical data only when enabled): `packages/knowledge-graph/src/packs.test.ts`.
- [x] Every pack's use cases exist in the catalog: `apps/web/src/usecases/packs.test.ts`.
- [x] No proof-era name is tracked outside the archive: `pnpm template:check`.
- [x] Tests, evals and the e2e suite run the full-tour profile, so every module stays covered.
- [ ] `pnpm verify` passes.
- [ ] The Apex rename and store-lookup change are deployed to a sandbox and their tests run (needs a sandbox; not done).
- [x] Playwright e2e run against the renamed UI with the full-tour profile: 19 passed on the bundled Chromium (the Chrome and Edge channels are not installed in the authoring container; CI runs both).

## Verification

```text
pnpm verify
pnpm template:check
```

## Evidence

Unit tests: 157 passed; Worker tests: 132 passed; routing evaluation 28/28 under both the example and full-tour profiles; Playwright e2e: 19 passed (Chromium, full-tour profile).

## Limitations

- Packs other than restaurant and financial services reuse the core flows only; they have no industry-specific tools. Adding a vertical means a new module (data, tools, scenarios), not just a pack file.
- A pack's use-case prompts in the catalog still contain restaurant and wealth scenarios (California cities, a fictional acquisition); they appear only when their module is on.
- Pack vocabularies are fictional and unreviewed by a domain expert.
