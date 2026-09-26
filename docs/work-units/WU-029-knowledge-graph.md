---
id: WU-029
title: Neo4j knowledge graph for explainable, multi-hop campaign intelligence
status: active
plan_sections: [10, 13, 16, 17]
owners: [agent]
issue: 37
---

# Objective

Implements issue #37. The orchestrator answers relationship questions from a governed, read-only Neo4j knowledge graph and shows the evidence paths behind each answer.

## Delivered

- **`packages/knowledge-graph`:**
  - a deterministic fictional dataset: 1,634 nodes and 6,562 relationships, covering accounts, buying-role personas, campaigns, segments, content, briefs, brand rules, consent scopes, channels, Coastline Kitchen locations and menu, dayparts, weather buckets, and 1,500 fictional past pushes
  - six curated tools, each with Cypher and an equivalent in-memory implementation
  - a Query API client that always runs in read mode
- **Tools:**
  - `get_graph_overview`
  - `explain_buyer_group`
  - `find_audience_overlap`
  - `check_consent_coverage`
  - `find_similar_past_pushes`
  - `trace_content_lineage`
  - Each returns bounded evidence paths.
- **MCP:** `northstar-knowledge-graph` is served at `/mcp/knowledge-graph` behind Access and used in-process by the orchestrator. It uses Neo4j when the secrets are set, and the in-memory copy otherwise.
- **Routing:**
  - new graph intents: buyer group with "why" or "evidence", consent coverage for a channel, audience overlap or fatigue, content lineage, and knowledge-graph overview
  - the restaurant push plan is now profile → weather → `find_similar_past_pushes` → Salesforce content
  - the step limit is 6
  - graph guidance enters the system prompt only while a graph tool is planned
- **UI:**
  - a "Knowledge graph · Neo4j" source in the rail (labelled "demo copy" when the fixture is in use)
  - a Graph evidence panel under assistant messages, rendering each path as a directional chain with a text alternative
  - four new Quickstart prompts
- **Operations:**
  - `pnpm kg:seed --confirm [--reset]`: idempotent `MERGE`, constraints, and a count read-back
  - `pnpm kg:parity`: Neo4j and the in-memory copy compared for every tool
  - a daily keep-alive cron
  - `DISABLED_TOOLS` covers the graph tools, and `/agent/operations` reports the graph source
- **Evals:** the runner includes the graph tools, using the in-memory copy by default and `--live-graph` for Aura. The demo scenarios add buyer-group evidence and consent coverage, and the push scenario expects the four-step plan.

## Evidence

- **Aura:** seeded with a read-back of exactly 1,634 nodes and 6,562 relationships in about 7 seconds.
- **Parity:** `pnpm kg:parity` matched all 21 tool cases between Neo4j and the in-memory copy, at 47–307 ms per case.
- **Read mode:** a read-mode `CREATE` was rejected by Aura with `Neo.ClientError.Statement.AccessMode`.
- **Live smoke** (gpt-oss-20b, `--live-graph`, 2 trials): 17/18 turns passed.
  - Buyer-group and consent scenarios passed both runs, with graph-grounded Markdown answers.
  - One of the two push runs wrote its final content-tool call as unrecoverable text, a known gpt-oss behavior the forced-tool guard only partly covers.

## Acceptance criteria

- [x] Read-only tools with fixed, parameterized Cypher and database-enforced read mode.
- [x] Works on Aura Free, with tool latency well under 500 ms.
- [x] Graph evidence panel with a text alternative, and the rail source status.
- [x] Graceful MCP error when Aura is unavailable or paused.
- [x] No PII: personas and aggregate engagement only.
- [x] `pnpm verify` passes.
- [ ] After deploy: run the buyer-group and push scenarios in production and confirm the rail shows "Neo4j".

## Verification

```text
pnpm verify
pnpm kg:parity                    # needs the Neo4j environment variables
pnpm eval:live --models @cf/openai/gpt-oss-20b --trials-demo 2 --trials-routing 0 --live-graph --out <scratch>
```
