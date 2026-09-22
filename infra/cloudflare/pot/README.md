# Cloudflare proof environment

This directory records the Phase 1 deployment gate. `wrangler.jsonc` is the executable configuration; there is intentionally no second infrastructure source of truth.

## Pre-deployment gate

1. Run `pnpm verify` from a clean checkout.
2. Confirm `wrangler whoami` names the isolated proof account. A login or MFA prompt is the human authorization boundary.
3. Configure one Access application for the Worker URL, email one-time PIN, and an explicit evaluator allowlist. A pre-existing reusable policy may be attached when its rule is verified; treat that shared policy as external infrastructure and do not rename, edit, or delete it from this repository. Record application identifiers outside Git when they are account-specific.
4. The committed deployment configuration is fail-closed with `ENVIRONMENT=proof` and `AUTH_MODE=access`. Set the Access team domain and audience as account-specific variables before the authenticated live test. The Worker must reject an unsigned `/api/session` request; never deploy the local E2E configuration.
5. Run `pnpm exec wrangler deploy --dry-run`, deploy, then record the version ID and provisioned D1/R2 identifiers written by Wrangler.
6. Read back `/api/health`, `/api/ready`, an authorized session, an unauthorized session, and the three binding dashboards. Confirm logs/traces contain correlation IDs without PII.
7. Run `PROOF_BASE_URL=https://<worker-host> pnpm test:e2e:live` to prove the
   unsigned edge boundary. After a human completes the email one-time-PIN flow,
   rerun with that browser-issued token in the ephemeral `CF_ACCESS_JWT`
   environment variable to prove authenticated readiness. Never create a service
   token for this proof, and never write the JWT to a file or report.

## Phase 2 Salesforce MCP portal gate

The Phase 2 portal is a browser-user integration, not a service-token integration. Keep the existing `AWB` Worker Access policy unchanged and configure a separate MCP portal application for the same evaluator allowlist.

1. Prove the custom Salesforce Hosted MCP server directly with `salesforce/postman/Northstar-Marketing-Workbench.postman_collection.json`. Use OAuth authorization code with PKCE and the External Client App scopes `mcp_api refresh_token`. Record only sanitized responses.
2. In Zero Trust > Access controls > MCP Portals, add the Salesforce Hosted MCP URL as a Streamable HTTP server with manual OAuth credentials. Register the exact callback URI shown by Cloudflare in the Salesforce External Client App. The current shared callback option is `https://oauth-callbacks.cloudflareaccess.com/cdn-cgi/access/outbound-oauth-callback`.
3. Create one portal, add only the Salesforce server, keep **Require user auth** enabled (`on_behalf=true`), and keep Code Mode and Gateway routing/DLP off for this proof. Apply the evaluator allow policy to both portal and server Access applications.
4. Curate the portal tool list to exactly `packages/contracts/src/tool-catalog.json`. Do not expose portal-native server toggles to the orchestrator's model context; the Worker filters again and never exposes write tools to autonomous execution.
5. Set the Worker's `SALESFORCE_MCP_URL` secret to the portal `/mcp` endpoint and deploy D1 migration `0001_phase2_confirmation_audit.sql` before the Worker. The endpoint is treated as deployment configuration to prevent an unreviewed URL from entering source.
6. As the evaluator, connect from the workbench, complete portal OAuth and per-user Salesforce OAuth, then read back connection state, namespaced tools, readiness output, a confirmed draft save, and a confirmed review task. Both writes must show the same idempotency key in D1 audit and Salesforce authoritative read-back.

Service tokens are intentionally excluded: Cloudflare documents that per-user upstream OAuth requires `on_behalf=true`, while service-token sessions require it to be false and use the admin credential. That would violate the proof's identity model.

## Rollback and teardown

Delete only the IDs recorded by this work unit: the proof Worker, Access application/policy, D1 database, R2 bucket, and Durable Object namespace/migration associated with the proof Worker. Export no data. Read back the resource lists after deletion and attach the results to the work unit. Never use a broad account cleanup command.
