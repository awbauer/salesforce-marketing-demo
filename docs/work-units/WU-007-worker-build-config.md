---
id: WU-007
title: Make Worker deployments deterministic from main
status: complete
plan_sections: [3, 10, 14, 15, 16, 17]
owners: [agent]
---

# Objective

Prepare the existing Cloudflare Worker for repository-driven deployment from `main` without auto-provisioning replacement data resources or exposing runtime secrets.

## Scope

- In-scope paths: `wrangler.jsonc`, package scripts, Cloudflare deployment documentation, contract checks, and WU-007 evidence.
- Explicitly out of scope: connecting the Git provider in the dashboard, changing Access policies, rotating secrets, enabling shared-resource previews, or deploying the Worker from this branch.
- Live resources remain the existing proof Worker, D1 database, R2 bucket, Durable Object namespace, AI binding, and runtime secrets.

## Contracts affected

- Deployment: D1 and R2 bindings become explicit and deterministic; the compatibility date advances after full verification.
- Commands: adds stable build-before-deploy and dry-run commands.
- Runtime behavior, tools, writes, schemas, and external systems: unchanged.

## Acceptance criteria

- [x] Wrangler identifies the existing D1 database and R2 bucket explicitly.
- [x] The configuration retains Durable Object migrations, assets, AI, observability, fixed proof variables, and generated types.
- [x] Runtime secrets remain absent from source and are documented as Worker-owned secrets.
- [x] Workers Builds settings for `main`, Node, pnpm, verification, and deployment are documented.
- [x] Preview builds remain disabled until isolated resources exist.
- [x] Dry-run packaging and the full repository verification pass without external mutation.

## Verification

```text
pnpm deploy:dry-run
pnpm verify
pnpm security:blocked-words
```

## External mutations

None. The user will connect the repository to the existing Worker after this reviewed change reaches `main`.

## Evidence

- Live read-back: D1 and R2 inventory names match the checked-in binding targets; the Worker retains the three expected secret names without exposing values.
- Reports: generated under `artifacts/reports/WU-007/`.
- Known limitations: Workers Builds dashboard settings and the Git-provider connection cannot be source-controlled in `wrangler.jsonc`; preview builds require isolated resources before enablement.

## Completion

- Final status: complete; the dry run packaged the Worker with the intended existing bindings and the full 12-gate verification passed.
- Commit: pending final commit.
- Summary: repository-driven `main` deployments are deterministic once the documented Workers Builds settings are applied.
