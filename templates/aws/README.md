# AWS template

Runs the workbench on AWS as **one Fargate task** (the same container as `templates/local`) behind an HTTPS load balancer that signs users in with **Cognito**. Models come from **Amazon Bedrock**. State lives on **EFS**. This is a single-instance demo deployment: the Durable Object runtime keeps its state in files on one volume, so do not scale beyond one task.

```text
Users ─HTTPS─▶ ALB (Cognito sign-in) ─▶ Fargate task: workbench container (workerd) ─▶ Bedrock
                                                    └─ EFS: D1, R2 and Durable Object state
```

## What gets created

A VPC with public subnets only (no NAT gateway cost), an encrypted EFS file system and access point, an ECS cluster and Fargate service (1 vCPU, 2 GB, one task), an Application Load Balancer with an HTTPS listener that authenticates with a new Cognito user pool, one Cognito user per allowed email, and Secrets Manager entries for the confirmation signing key. The container image is built from this repository with your `workbench.profile.json` baked in.

## Prerequisites

- An AWS account and credentials in your shell (`aws sts get-caller-identity` works), CDK bootstrapped in the target region (`npx cdk bootstrap`).
- Docker running locally (CDK builds the image).
- A domain you control and an ACM certificate for it in the same region.
- For Bedrock: model access enabled for your chosen model in the Bedrock console, and a **Bedrock API key** stored in Secrets Manager (plain-text secret value). The container reads it as `AWS_BEARER_TOKEN_BEDROCK`. No IAM policy for model invocation is needed.
- Run `pnpm workbench:init` first and choose Bedrock for the chat model (for example `openai.gpt-oss-20b-1:0`), so the profile baked into the image uses it.

## Deploy

```sh
cd templates/aws/cdk
npm ci
# Review what will be created. Nothing is created by synth or diff.
npx cdk synth \
  -c domainName=workbench.example.com \
  -c certificateArn=arn:aws:acm:<region>:<account>:certificate/<id> \
  -c cognitoDomainPrefix=<globally-unique-prefix> \
  -c allowedEmails=you@example.com,colleague@example.com \
  -c bedrockSecretName=workbench/bedrock-api-key
# Create it (this costs money while it runs):
npx cdk deploy <same -c flags>
```

Then point a DNS record for `domainName` at the `LoadBalancerDns` output and open it over HTTPS. Cognito emails the allowed users a temporary password on first sign-in.

## Cost and teardown

Expect roughly the cost of one small Fargate task, an ALB, EFS and Bedrock usage. Tear everything down with `npx cdk destroy <same -c flags>`; the EFS file system and Cognito pool are set to be deleted with the stack.

## How sign-in is enforced

The load balancer authenticates users with Cognito and forwards a signed `x-amzn-oidc-data` token. The Worker (`AUTH_MODE=alb-oidc`) verifies its signature against the load balancer's public keys, pins the signer to this load balancer's ARN, checks the issuer, and applies `ALLOWED_EMAILS`. Without a valid token the app returns 401, and the container refuses to start with `AUTH_MODE=development` unless `WORKBENCH_ALLOW_OPEN=1` is set (the local compose file does, bound to 127.0.0.1).

Salesforce stays in fixture mode here (`ENVIRONMENT=local`). To connect a sandbox you need the production path (`ENVIRONMENT=production`, `SALESFORCE_MCP_URL`, an MCP portal or direct OAuth setup); that is not wired into this template.

## What was verified

`cdk synth` produces a template, and the container's start-up script was run natively to confirm that auth is enforced (401 without a token) and that the Worker's configuration is rewritten from environment variables. The image was **not built and the stack was not deployed** in the authoring environment (no Docker daemon, no AWS account); treat the first deploy as a test.
