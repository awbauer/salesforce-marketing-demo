# ADR-002: Phase 1 Cloudflare foundation

- Status: accepted
- Date: 2026-09-19

## Decision

Use one root Vite 8 application with the Cloudflare Vite plugin, React 19, the Agents Vite plugin, and a single Worker entry point. `AIChatAgent` owns the SQLite-backed transcript and resumable stream. The Worker—not the browser—derives one Durable Object key from the authenticated identity and fixed Northstar workspace. Cross-boundary state originates in Zod contracts, and native cards render through one tile registry.

D1 and R2 use Wrangler's automatic provisioning in the isolated proof account. This keeps the proof setup small; deployment IDs must be read back into the work-unit evidence before the gate passes. Local mode uses an explicit fictional evaluator and deterministic response so a clean agent can prove the full interaction without cloud credentials. Proof mode has no such bypass.

The primary `wrangler.jsonc` is proof-only and fails closed through Access authentication. Local browser tests use the separate `wrangler.e2e.jsonc`; it is never a deployment target.

## Consequences

The local slice is repeatable and carries no Salesforce dependency. It demonstrates persistence and policy shape, not model quality or Salesforce integration. Live Access, AI Gateway routing, account isolation, telemetry, and resource teardown remain required Phase 1 pre-deployment evidence.
