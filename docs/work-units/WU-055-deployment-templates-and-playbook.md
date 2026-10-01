---
id: WU-055
title: Optional Cloudflare and AWS templates, a container image, and the playbook README
status: active
owners: [agent]
---

# Objective

- The workbench runs locally with no cloud account, and an owner can opt in to Cloudflare or AWS from checked-in templates that deploy only after confirmation.
- The README is a playbook: install, set up an instance, run a client demo, choose where to run it.

## Scope

- In-scope paths: `templates/{cloudflare,aws,container,local}/`, `.dockerignore`, `apps/edge/src/auth.ts` (OIDC modes), `apps/edge/src/models.ts` (Bedrock API key, `OLLAMA_BASE_URL` precedence), `README.md`, `docs/salesforce-deployment-pipeline.md`.
- Explicitly out of scope: a non-workerd runtime, multi-instance AWS scaling, wiring a Salesforce sandbox into the AWS template.

## Changes

- **Auth modes** beyond local and Cloudflare Access: `oidc` (bearer token against an issuer's JWKS or static keys) and `alb-oidc` (AWS load balancer's signed token, pinned to the balancer's ARN), each with an optional `ALLOWED_EMAILS` list.
- **Container** (`templates/container/`): a Dockerfile that builds the app and serves it with `vite preview` in workerd; `configure.mjs` writes selected environment variables into the built Worker configuration (a `.dev.vars` file was found not to take effect in preview, so it is not used); the entrypoint refuses to start without sign-in unless `WORKBENCH_ALLOW_OPEN=1`.
- **Local compose**, **Cloudflare** (render library, deploy script with `--provision` and `--apply` each behind a typed confirmation, README), **AWS** (CDK app: Fargate, EFS, ALB with Cognito, Secrets Manager; README).
- Bedrock chat uses a Bedrock API key (`AWS_BEARER_TOKEN_BEDROCK`), which needs no credential chain inside workerd.

## Acceptance criteria

- [x] OIDC and ALB sign-in are verified, reject missing, wrong-audience, wrong-signer and non-allowed tokens (`apps/edge/src/auth.worker.test.ts`).
- [x] The Cloudflare template renders valid configurations for fixture and sandbox profiles and never contains an account id (`scripts/cloudflare-template.test.mjs`).
- [x] `wrangler deploy --dry-run` accepts the rendered configuration.
- [x] The container start-up script, run natively against a build, enforces sign-in (401 with `AUTH_MODE=alb-oidc`) and refuses `AUTH_MODE=development` without `WORKBENCH_ALLOW_OPEN=1`.
- [x] `cdk synth` of the AWS stack succeeds (27 resource types, no account lookups).
- [x] `pnpm verify` passes.
- [ ] `docker build` of the image and a run of the container (no Docker daemon in the authoring container).
- [ ] A live Cloudflare deploy and a live AWS deploy (no accounts; both need owner approval).
- [ ] A live Bedrock turn.

## Verification

```text
pnpm exec vitest run --config vitest.worker.config.ts apps/edge/src/auth.worker.test.ts
pnpm exec vitest run --config vitest.config.ts scripts/cloudflare-template.test.mjs
node templates/cloudflare/deploy-cloudflare.mjs        # dry run
cd templates/aws/cdk && npm ci && npx cdk synth -c domainName=… -c certificateArn=… -c cognitoDomainPrefix=… -c allowedEmails=…
pnpm verify
```

## Evidence

Worker tests: 137 passed. The dry run listed the Durable Object, D1, R2, AI and assets bindings with `AUTH_MODE="access"`. The native container run returned `401 UNAUTHENTICATED` for `/api/session` with `AUTH_MODE=alb-oidc`; an earlier run that appeared to return 200 was a stale server on the same port, which is why the check was repeated on a clean port.

## Limitations

- The AWS stack uses public subnets with a public IP on the task, reachable only from the load balancer's security group; add a NAT gateway and private subnets if your policy requires it.
- One task only: state is files on EFS.
- The AWS template keeps Salesforce in fixture mode.
- `cdk deploy` builds the image with Docker and bakes in the `workbench.profile.json` on disk, including any chat endpoint in it.
