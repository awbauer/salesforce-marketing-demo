# Cloudflare template (optional)

Deploys this instance to **your own Cloudflare account** as one Worker with a Durable Object, a D1 database, an R2 bucket and optional Workers AI and AI Gateway. Sign-in is Cloudflare Access. Nothing here is needed to run the workbench locally.

`wrangler.jsonc` in the repository root is the **local**, account-free configuration. This directory holds the deployable one as a template; `deploy-cloudflare.mjs` renders it from your profile into the ignored file `wrangler.cloudflare.jsonc`.

## Deploy

All commands are safe until you add a flag and type your instance id to confirm.

1. **Log in:** `pnpm exec wrangler login`, then `pnpm exec wrangler whoami` and check it names the account you intend to use. A login or MFA prompt is yours to complete.
2. **Dry run:** `node templates/cloudflare/deploy-cloudflare.mjs` renders the config, builds, and runs `wrangler deploy --dry-run`. It prints the bindings it would create.
3. **Create the storage:** `node templates/cloudflare/deploy-cloudflare.mjs --provision` creates the D1 database and R2 bucket after you confirm. Copy the printed `database_id`.
4. **Set secrets:**
   ```sh
   export D1_DATABASE_ID=<the id>
   printf '%s' "$(openssl rand -hex 32)" | pnpm exec wrangler secret put CONFIRMATION_SIGNING_KEY --config wrangler.cloudflare.jsonc
   ```
5. **Put Access in front of it** (Zero Trust → Access → Applications): one self-hosted application for the Worker URL with an explicit allow list of emails, then set `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` as Worker secrets (`wrangler secret put`). The Worker rejects requests without a valid Access token; it never serves the local no-sign-in mode here.
6. **Deploy:** `node templates/cloudflare/deploy-cloudflare.mjs --apply` (after confirming).
7. **Read back:** `/api/health`, `/api/ready` (shows the chat provider and the bindings), a signed-in `/api/session`, and an unsigned `/api/session` that must return 401. Then `WORKBENCH_BASE_URL=https://<host> pnpm test:e2e:live` for the unsigned edge boundary.

`ENVIRONMENT` is rendered as `local` for a fixture Salesforce (scripted Salesforce, real sign-in) and `production` when the profile connects a sandbox (needs `SALESFORCE_MCP_URL` and the Salesforce setup below).

## Models on Cloudflare

Set the profile's chat provider to `workers-ai` (for example `@cf/openai/gpt-oss-20b`) and run `pnpm workbench:init` again before deploying; the profile is compiled into the Worker. Set `AI_GATEWAY_ID` in the environment to route calls through an AI Gateway you created. Any other provider (an OpenAI-compatible endpoint, Bedrock) also works from a Worker; give it its secrets with `wrangler secret put`.

## Salesforce sandbox through a Cloudflare MCP portal (optional)

The portal is a per-user (browser) integration, not a service-token one. Per-user upstream OAuth needs `on_behalf=true`, and service-token sessions require it to be false, so do not use service tokens.

1. Prove the Hosted MCP server directly with `salesforce/postman/Marketing-Workbench.postman_collection.json` (OAuth authorization code with PKCE; External Client App scopes `mcp_api refresh_token`). Record only sanitized responses.
2. In Zero Trust → Access controls → MCP Portals, add the Hosted MCP URL as a Streamable HTTP server with manual OAuth credentials, and register the callback URI Cloudflare shows in the Salesforce External Client App.
3. Create one portal with only that server, keep **Require user auth** on, and apply your allow policy to both the portal and the server applications.
4. Curate the portal's tools to exactly `packages/contracts/src/tool-catalog.json`. The Worker filters again, and never exposes write tools to autonomous execution.
5. Set `SALESFORCE_MCP_URL` to the portal's `/mcp` endpoint and apply D1 migrations: `pnpm exec wrangler d1 migrations apply APP_DB --remote --config wrangler.cloudflare.jsonc`. `pnpm contracts:check` enforces that the audit schema accepts every allowed write.
6. As a signed-in user, connect from the workbench and read back the connection state, the namespaced tools, a readiness result, a confirmed draft save, and a confirmed review task. Each write must show the same idempotency key in the D1 audit and in Salesforce.

After any MCP definition change, refresh the custom server in Salesforce, use **Sync capabilities**, enable each new approved tool in the portal, and run `pnpm test:production:chat` with an ephemeral Access token.

## Operator kill switches

Optional runtime switches pause risky behavior without a code change. They are Worker secrets (not `vars`) so a redeploy does not reset them. When unset, everything is enabled.

- `WRITES_ENABLED=false` pauses every confirmed write; preflight and execute return `503 WRITES_DISABLED`.
- `DISABLED_TOOLS` is a comma-separated list of tool names to turn off.
- `MEMORY_ENABLED=false` stops long-term memory.

```sh
printf 'false' | pnpm exec wrangler secret put WRITES_ENABLED --config wrangler.cloudflare.jsonc
pnpm exec wrangler secret delete WRITES_ENABLED --config wrangler.cloudflare.jsonc
```

`GET /agent/operations` reports the active controls; `GET /agent/audit/export` downloads the caller's audit rows within the retention window. Older rows are pruned on every write and hourly by the cron.

## Neo4j graph (optional)

Without Neo4j the knowledge graph tools use the in-memory copy of the dataset. To use Aura instead, set `NEO4J_QUERY_URL` (`https://<instance>.databases.neo4j.io/db/<database>/query/v2`), `NEO4J_USERNAME` and `NEO4J_PASSWORD` as Worker secrets, then seed it with the same variables exported locally: `pnpm kg:seed --confirm --reset`, and check `pnpm kg:parity`. The seed uses the dataset of your instance profile; parity checks run against the full-tour profile. The hourly cron runs one read query so Aura Free does not pause.

## Workers Builds (optional)

If you connect the repository to Workers Builds, build with `pnpm verify` and deploy with `pnpm exec wrangler deploy --config wrangler.cloudflare.jsonc`; commit nothing instance-specific (the rendered config is ignored), so render it in the build command or deploy from your machine instead. Set `NODE_VERSION=26` and `PNPM_VERSION=11.22.0`. Keep secrets as runtime secrets, never build variables.

## Teardown

Delete only what you created: the Worker, the Access application and policy, the D1 database and the R2 bucket, then list resources to confirm. Never use a broad account cleanup command.

## What was verified

The template renders to a valid configuration (unit-tested) and `wrangler deploy --dry-run` accepts it. A live deploy to a Cloudflare account was **not** performed in the authoring environment.
