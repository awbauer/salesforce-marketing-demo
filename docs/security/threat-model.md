# Threat and data-classification record

## Boundary

A workbench instance uses fictional sample data. It exposes no publish, send, activate, delete, suppress, buyer-group or arbitrary-CRUD tool. The only writes are the confirmed, idempotent, read-back set in `DEFAULTS.allowedWrites`. The identity perimeter depends on the deploy target (local principal, Cloudflare Access, or OIDC); the Worker is always the authorization boundary.

## Data classes

| Data | Class | Storage | Model policy |
| --- | --- | --- | --- |
| Operator subject and email | Internal identity | Durable session metadata | Excluded from prompts |
| Fictional campaign, account and content data | Sample / non-production | Knowledge graph fixture, Durable Object conversation | Allowed |
| Tile source references | Sample / non-production | Durable Object state | Allowed |
| Customer, contact or audience-member details | Prohibited | Never stored | Blocked |
| Credentials, JWTs, signing keys | Secret | Never logged or persisted in Git | Blocked |
| The real name of the client being demoed | Confidential | Only `.config/blocked-words.local` | Never enters the repo |

## Controls

- The browser cannot choose a Durable Object name: the Worker hashes the authenticated subject, tenant and workspace id.
- Non-local modes fail closed when the assertion, issuer, audience or role is invalid. The fixed local principal exists only when both `AUTH_MODE=development` and `ENVIRONMENT=local`.
- Structured errors carry a correlation id, never tokens, claims, prompts or stack traces.
- Writes require a server-side confirmation (five-minute expiry, exact scope, principal, request hash, idempotency key, HMAC signature) and an authoritative read-back; operators can disable writes, tools or memory.
- Retrieved text is data, never instruction. Generated images are untrusted drafts.
- Model traffic goes to the endpoint named in the profile. The default is a local Ollama server, so prompts never leave the machine; hosted providers are an explicit profile choice.
- Retention (transcripts, audit, images) comes from the profile and is enforced by the hourly prune on Cloudflare; local runs keep state only in the local data directory.

## Residual limits

Account isolation, access policy, telemetry and teardown for Cloudflare or AWS deployments cannot be proven from a clone; they are pre-deployment checks in the matching `templates/*/README.md`. Local-model tool-calling quality is unmeasured until `pnpm eval:live` is run against it.
