---
id: WU-001
title: Establish the agent-first repository execution contract
status: complete
plan_sections: [13, 15]
owners: [agent]
---

# Objective

Make the planning repository executable by coding agents with explicit autonomy, quality gates, drift controls, evidence requirements, and narrow human escalation criteria.

## Scope

- In-scope paths: `AGENTS.md`, `README.md`, `.github/`, `docs/agent-delivery-contract.md`, `docs/agentic-marketing-workbench-plan.md`, `docs/decisions/`, and `docs/work-units/`.
- Explicitly out of scope: application scaffolding, package-manager commands, CI workflow implementation, Salesforce changes, Cloudflare changes, and any external deployment.
- Prerequisites: the proof scope and chosen defaults in the implementation plan.

## Contracts affected

- Schemas: work-unit front matter and future machine-readable verification reports.
- Tools/actions: none.
- Tiles/HXL: none.
- External state: none.

## Acceptance criteria

- [x] Root instructions define source precedence, autonomous work loop, agent-owned decisions, guardrails, and the exact human-escalation boundary.
- [x] The plan describes an agent-first repository structure and executable anti-drift gates.
- [x] A delivery contract defines stable root commands for Phase 1 to implement.
- [x] Work-unit, decision-record, and pull-request templates enforce acceptance and evidence.
- [x] Documentation distinguishes current planning artifacts from commands that Phase 1 must create.
- [x] No proof boundary or Section 17 default changed.

## Verification

```text
git diff --check
awk '/^```/{n++} END {if (n % 2) exit 1}' docs/*.md docs/work-units/*.md docs/decisions/*.md
rg -n "F[I]XME|X[X]X" AGENTS.md README.md docs .github
```

`pnpm verify:fast` and `pnpm verify` do not exist because application scaffolding has not begun; Phase 1 is explicitly responsible for creating them before feature work.

## External mutations

None. This work unit changes repository documentation and templates only.

## Evidence

- Reports: command results recorded in the commit/turn completion report.
- Screenshots: not applicable; no application UI changed.
- Deployment identifiers: not applicable.
- Read-back results: repository diff and clean post-commit status.
- Known limitations: machine enforcement begins when Phase 1 creates the package scripts and CI workflow specified by the delivery contract.

## Completion

- Final status: complete
- Commit: resolve with `git log -1 --format=%H -- docs/work-units/WU-001-agent-first-repository.md`
- Summary: agent execution, evidence, guardrail, drift, and escalation contracts added to the repository and implementation plan.
