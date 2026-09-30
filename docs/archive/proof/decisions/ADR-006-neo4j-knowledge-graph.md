# ADR-006: Neo4j Aura as a read-only knowledge graph

Status: accepted

Date: 2026-09-26

## Context

Issue #37 proposed a knowledge graph so the orchestrator can answer multi-hop questions (buyer-group evidence, audience overlap, consent coverage, past push performance, content lineage) with explainable paths. Andrew Bauer approved building it and supplied a Neo4j AuraDB instance.

## Decision

- **Store:** Neo4j AuraDB is a new read-only external system. It holds only the fictional `northstar-kg-v1` dataset from `packages/knowledge-graph`: personas are buying roles, not people, and engagement is aggregated.
- **Access:** the Worker uses the Query API v2 over HTTPS, since Workers can't use Bolt.
  - Every tool query runs with `accessMode: "Read"`. The database itself rejects writes (verified live with `Neo.ClientError.Statement.AccessMode`), and all Cypher is fixed and parameterized.
  - Credentials are Worker secrets (`NEO4J_QUERY_URL`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`). They are never vars or source, and not GitHub secrets, because no workflow uses them.
- **Tools:** `northstar-knowledge-graph` is an MCP server with six curated tools and no free-form Cypher. It is served at `/mcp/knowledge-graph` behind Access and used in-process by the orchestrator.
- **Fallback:** without the secrets, the tools run on an in-memory copy of the same dataset. `pnpm kg:parity` proves the Cypher and the in-memory copy return identical results.
- **Writes:** only `pnpm kg:seed --confirm` writes to the graph, run by an operator. Chat never writes.
- **Keep-alive:** a daily cron runs one read query so Aura Free doesn't pause after 3 idle days, which would lead to deletion 30 days later.

## Consequences

- Graph answers show evidence paths in the UI, and the rail shows whether the graph is live Neo4j or the demo copy.
- A paused or unreachable instance becomes an MCP tool error that the model explains; turns don't fail.
- The dataset is small (1,634 nodes and 6,562 relationships), well inside Aura Free limits. Tool latency from the Worker is tens to a few hundred milliseconds.

## Supersedes

None. This extends Section 17's external systems with one read-only store holding fictional data.
