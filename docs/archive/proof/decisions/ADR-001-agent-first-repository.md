# ADR-001: Agent-first repository operating model

Status: accepted

Date: 2026-09-19

## Context

The proof is intended to be built, designed, tested, documented, and diagnosed primarily by coding agents. A conventional repository that relies on unstated team conventions and repeated human review would cause drift, inconsistent evidence, and unnecessary escalation.

## Decision

Make `AGENTS.md` the binding repository execution contract. Require scoped work units, stable root verification commands, typed cross-boundary contracts, machine-readable reports, agent-produced UI evidence, architecture decision records, fixed-default invariant checks, and authoritative read-back for external writes. Limit human involvement to credentials/consent, out-of-scope or irreversible changes, policy changes, proven external blockers, and the final proof evaluation.

## Consequences

- Phase 1 must implement the command and CI contracts before feature work.
- Agents may make ordinary implementation and visual-design choices without approval when they remain inside the proof boundaries.
- No work unit is complete while a required gate or evidence item is missing.
- Product-scope changes still require explicit user direction.
- Repository documentation and templates become part of the tested delivery system.

## Supersedes

The prior assumption that human product/design support participates throughout each implementation phase.
