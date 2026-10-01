# Architecture and safety model

What the workbench is, what it is allowed to do, and where each piece runs. This page describes behavior the repository demonstrates today. The proof-era plan that preceded it is kept in [`archive/proof/`](archive/proof/agentic-marketing-workbench-plan.md) for provenance and no longer binds new instances.

## What it is

A React workbench plus one orchestrator agent per person and workspace. The orchestrator answers marketing questions over a knowledge graph of fictional customer, campaign and content data, optionally reads from and writes to a Salesforce sandbox through a Hosted MCP server, and renders typed tiles.

```text
Browser (React)  ──WebSocket──▶  Worker + MarketingOrchestrator (Durable Object, workerd)
                                   ├─ chat model      (Ollama | OpenAI-compatible | Workers AI | Bedrock)
                                   ├─ image provider  (placeholder | OpenAI-compatible | Workers AI)
                                   ├─ in-process MCP  (campaign context, external services, knowledge graph)
                                   ├─ Salesforce MCP  (optional; fixtures when absent)
                                   └─ D1 + R2         (audit, turns, image drafts; local files when run locally)
```

## Everything per instance lives in the profile

`workbench.profile.json` (see `packages/contracts/src/profile.ts`) names the client brand, industry, use cases, model providers, caps, retention, Salesforce mode and deploy target. `pnpm workbench:init` writes it; `pnpm profile:build` compiles it for the Worker. See [ADR-009](decisions/ADR-009-portable-instances.md).

## Runtime targets

| Target | Runtime | Models | Auth | State |
| --- | --- | --- | --- | --- |
| Local (default) | workerd via `pnpm dev` | Ollama | fixed local principal | local D1/R2 files |
| Cloudflare | Workers + Durable Object | Workers AI or any provider | Cloudflare Access | D1, R2 |
| AWS | workerd in a container | Bedrock or any provider | OIDC (ALB/Cognito) | volume-backed D1/R2 files |

## Risk classes

| Class | Examples | Policy |
| --- | --- | --- |
| Read | metrics, campaign summary, account signals | auto-run within permissions |
| Draft | brief, copy, audience proposal | auto-run; marked as draft |
| Write | save a brief or campaign, create a review task or inventory case, attach a selected image | same-user confirmation with a preflight diff |
| Publish | publish, activate, send | never exposed |
| Destructive | delete, suppress, buyer-group change, arbitrary CRUD | never exposed |

A write is a server-side confirmation object: five-minute expiry, exact action and record scope, the requesting principal, a request hash and an idempotency key, signed with `CONFIRMATION_SIGNING_KEY`. A browser button alone is not authorization. Every write is idempotent, read back from Salesforce, and recorded in the D1 audit. `pnpm contracts:check` enforces the allowed write set and the tool catalog.

## Data rules

- Fictional sample data only. No customer PII in prompts, logs, fixtures, screenshots or generated images.
- Retrieved text (CRM fields, tool output) is data, never instruction.
- Generated images are untrusted drafts until a person reviews them.
- Operators can turn off writes, individual tools, or memory with `WRITES_ENABLED`, `DISABLED_TOOLS` and `MEMORY_ENABLED`.

## Not in scope

Journeys, paid media, a DAM, unrestricted CRUD or SOQL, sending or publishing, and multi-tenant hosting. The AWS target is a single-instance demo deployment, not a scalable service.
