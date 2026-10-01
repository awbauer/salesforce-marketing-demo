---
id: WU-039
title: Long-term graph memory, knowledge-graph acceptance leftovers, and the Learn drift gate
status: complete
plan_sections: [9, 15, 17]
owners: [agent]
issue: 41
---

# Why

- **Memory (issue #41).** A new chat starts with an empty workspace, so the workbench forgot drafts and decisions between chats.
- **Knowledge-graph leftovers (issue #37).** Three acceptance items were still open:
  - an eval check that graph answers name only entities in their tool results
  - p50 tool latency under 500 ms
  - a live smoke run
- **Learn drift.** Learn is the demo's teaching surface, but nothing kept it in step with the code.

## Changes

- **Long-term memory (ADR-007).**
  - The server writes memory into its own graph dataset, `northstar-memory-v1`, only on verified events:
    - confirmed, read-back saves, review tasks, and image attachments
    - "Remember this draft" in chat, or the Memory tab's button
  - Memory is modeled as `Draft` and `Decision` nodes:
    - draft versions link by `SUPERSEDES`
    - decisions link to their draft (`DECIDED_ON`) and to the Salesforce record (`RECORDED_IN`)
    - both link to demo `Campaign` and `Brand` nodes (`ABOUT`)
  - Recall tools `recall_decisions`, `recall_recent_work`, and `explain_memory` get the workspace from the server. They return dated, sourced items with provenance paths. The prompt makes the model treat memory as past work and re-check Salesforce.
  - Routing: recall questions route to the recall tools, and "remember this" is handled by the server. Local development answers recall questions from memory without a model.
  - History has a Memory tab with Forget. Remembers and forgets appear in the audit export.
  - `MEMORY_ENABLED=false` turns memory off. The hourly cron deletes memory after 14 days, and the actor is stored only as a hash.
  - Guards: the Graph explorer and the graph tools read only the demo dataset, and `kg:seed --reset` keeps memory.
- **#37 leftovers.**
  - `pnpm kg:parity` now covers memory against a throwaway workspace, then cleans up. It checks workspace isolation, and it reports p50 and p95 Neo4j tool latency, failing if p50 reaches 500 ms.
  - Evaluations gain a **graph-grounded** check: a graph or memory answer must not name an account, person, campaign, segment, menu item, or content asset that its tools didn't return. Older runs show no rate for it.
  - `pnpm eval` now scores the routing set through the production routers. New memory routing cases and holdouts were added.
- **Learn.**
  - New lesson: *Long-term memory*, with a diagram. The memory-layers table and diagram are updated.
  - Graph, MCP, governance, routing, observability, evaluations, orchestrator, and workspace sections are updated.
  - A searchable **Reference** lists 107 concepts, each linking to the section that teaches it.
- **Learn drift gate:** `pnpm learn:check`, in `pnpm verify` and `.github/workflows/learn.yml`.
  - **Coverage:** every tool, write action, graph node and relationship type, operator control, and Salesforce component in the code has a reference entry, and none is stale.
  - **New code:** every `.ts`, `.tsx`, `.mjs`, and `.cls` file is mapped to a section in `apps/web/src/learn/sources.ts`, or listed as untaught with a reason. Mapped and "Where to see it" paths must exist.
  - **Drift:** a branch that changes code a section explains must change that section, unless a commit carries `Learn-Reviewed: <ids> (<reason>)`.
  - `AGENTS.md` and the delivery contract's drift controls describe the gate.

## Acceptance criteria

- [x] Memory is written only on server events, scoped to the workspace, and expires after 14 days.
- [x] The three recall tools return dated, sourced results with provenance; the model is told to re-verify.
- [x] History → Memory lists memory and forgets items; `MEMORY_ENABLED` turns memory off.
- [x] The actor is stored as a hash; memory never mixes into the explorer or graph tools.
- [x] ADR-007, unit, worker, and E2E tests (remember → recall in a new chat → forget), and eval cases.
- [x] #37: graph-grounded eval check, p50 latency under 500 ms, live parity including memory.
- [x] The Learn gate enforces coverage, mapping, and drift, locally and in CI.

## Verification

```text
pnpm verify
pnpm test:e2e
pnpm learn:check
pnpm kg:parity   (live Aura)
```

## External mutations

- **Neo4j Aura:** `pnpm kg:parity` wrote three memory nodes to a throwaway `parity-*` workspace and deleted them. The read-back showed `0 memories left`. The demo dataset is unchanged.
- **Cloudflare:** none until this is merged and deployed. `MEMORY_ENABLED` is unset, so memory is on.

## Evidence

- **Live parity:** all 28 graph tool cases and 8 memory cases match Neo4j. Workspace isolation holds.
  - Latency: p50 84 ms, p95 308 ms over 36 calls, measured from a local machine against Aura.
- **Screenshots:**
  - `artifacts/evidence/WU-039/recall-{chrome,edge}.png`: a new chat recalls the remembered draft, dated and sourced.
  - `artifacts/evidence/WU-039/memory-tab-{chrome,edge}.png`: History → Memory with provenance.
- **Learn gate:** `pnpm learn:check` passes with 107 reference entries. A probe file and a trailer with no reason both fail it as expected.
- **Live model smoke (#37):** gpt-oss-20b, live Aura graph, one trial per demo scenario. `pnpm eval:live --cases …` now filters by case to keep costs down.
  - 9 of 11 scenarios passed, including the Coastline plans and both graph questions (buyer group, consent).
  - The first grounding failure counted only graph results as evidence, but the menu item came from the restaurant profile. The check now counts every tool result the turn used; on re-run, the email and buyer-group scenarios were grounded in 4 of 4.
  - Memory recall passed 4 of 4 with seeded memory and 3 of 3 with empty memory. One earlier turn ended with no text; production shows a recovery message when that happens.
  - One re-run email turn hit a tool error. This is existing gpt-oss-20b flakiness on the four-step plan, not something this branch changed.
- **Known limitations:**
  - Latency was measured from a laptop, not from the Worker. The Worker is in Cloudflare's network, so it is expected to be similar or faster.
  - The live model smoke run is listed in the PR.
