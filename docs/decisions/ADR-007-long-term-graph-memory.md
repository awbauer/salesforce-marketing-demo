# ADR-007: Long-term workspace memory in the knowledge graph

Status: accepted

Date: 2026-09-26

## Context

Issue #41 asked the workbench to remember drafts and decisions across chats. A new chat starts with an empty working set (WU-035), so "what did we decide about the Coastline push last week?" had no answer. ADR-006 made the knowledge graph read-only; memory needs a narrow write path into the same graph, so recall can link past work to the campaigns and brands it was about.

## Decision

- **What is remembered, and when.** The server writes memory only on events it has verified. The model never writes memory. The events are:
  - a confirmed Salesforce write that was read back (saving a campaign, brief, or message; a review task; an attached image)
  - an explicit request to remember the draft in focus ("remember this draft", or the Memory tab's button)
- **Shape.** Memory is its own dataset (`northstar-memory-v1`) in the same Aura database:
  - Nodes: `Workspace`, `MemoryEvent`, `Draft` (one per focus version), `Decision`, and `RecordRef`.
  - Relationships: `SUPERSEDES` links draft versions, `DECIDED_ON` links a decision to its draft, `RECORDED_IN` links it to the Salesforce record, and `ABOUT` links memory to the demo graph's `Campaign` and `Brand` nodes.
  - Every memory node carries `workspaceId` and `expiresAt`.
- **Write path.** `queryApiBackend` gains `write` (`accessMode: "Write"`), which only the fixed, parameterized statements in `packages/knowledge-graph/src/memory.ts` use. Graph tools still read with `accessMode: "Read"`, and there is still no free-form Cypher.
- **Recall.** Three read-only MCP tools read memory:
  - `recall_decisions(subject, limit ≤ 10)`
  - `recall_recent_work(limit ≤ 10)`
  - `explain_memory(memoryId)`

  They're registered only with a server-provided workspace context; the model can't name or see a workspace. Results are dated and sourced and carry provenance paths. The prompt tells the model that memory is past work, and that it must re-check Salesforce before reusing it.
- **Privacy.** The actor is stored as a salted SHA-256 prefix, never a subject or email. Remembered fields come from the focus draft, which holds no customer PII.
- **Retention and control:**
  - Memory expires after 14 days. Reads hide expired items, and the hourly cron deletes them.
  - The History → Memory tab lists memory with its provenance and a Forget button. Forgets and remembers are logged in the 24-hour audit export.
  - `MEMORY_ENABLED=false` withholds the recall tools and stops all remembering.
- **Isolation from the demo graph:**
  - The Graph explorer and every graph tool filter on the demo dataset.
  - `kg:seed --reset` deletes only `northstar-kg*` nodes, so a reseed keeps memory.
- **Parity.** The in-memory store implements the same semantics. `pnpm kg:parity` writes to a throwaway workspace on Aura, compares every memory read with the in-memory store, checks workspace isolation, and forgets what it wrote.

## Consequences

- Memory survives new chats and is shared by everyone in the workspace. It never overrides Salesforce: the model has to re-read Salesforce before acting on it.
- Aura now holds a small amount of non-fictional workspace data: draft text written in the demo, and Salesforce record ids. It's kept for 14 days, and a user can forget any item.
- A memory write failure never fails the Salesforce write it describes. The failure is only logged.
- Local development keeps memory in the isolate, and a recall question gets a scripted answer from the same tool.

## Supersedes

ADR-006's "Chat never writes" and "every query runs with `accessMode: "Read"`" now apply to the demo dataset only. The server's fixed memory statements are the single write path, and only for the memory dataset.
