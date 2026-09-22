# Phase 1 threat and data-classification record

## Boundary

Phase 1 uses fictional Northstar sample data and proves the application shell, identity boundary, durable conversation, and typed tiles. It performs no Salesforce call and exposes no mutation tool. Cloudflare Access is the proof identity perimeter; the Worker remains the authorization boundary.

## Data classes

| Data | Class | Storage | Model policy |
| --- | --- | --- | --- |
| Evaluator subject and email | Internal identity | Durable session metadata, 14 days | Excluded from prompts |
| Fictional campaign summaries | Sample/non-production | Durable Object conversation, 14 days | Allowed |
| Tile source references | Sample/non-production | Durable Object state | Allowed |
| Customer/contact/audience details | Prohibited | Never stored | Blocked |
| Credentials and Access JWTs | Secret | Never logged or persisted | Blocked |

## Threat controls

- The browser cannot select a Durable Object name. The Worker hashes the authenticated subject, tenant, and fixed workspace ID.
- Proof mode fails closed when the Access assertion, issuer, audience, or role is invalid. The local principal exists only when both `AUTH_MODE=development` and `ENVIRONMENT=local`.
- The Phase 1 tool surface is empty. Publish, send, activate, delete, suppress, buyer-group mutation, and arbitrary CRUD are absent.
- Structured errors contain a correlation ID but never echo tokens, claims, prompts, or stack traces.
- Static assets are separated from `/api/*` and `/agent*`; all agent and session paths pass Worker authorization first.
- Durable chat persistence and resumable streams are provided by `AIChatAgent`; explicit Stop cancels the server turn while ordinary client disconnects remain resumable.
- Logs and traces are enabled. The proof retains no copied customer dataset and has no image objects yet.

## Residual Phase 1 limits

The live Access policy, account resource isolation, telemetry read-back, and teardown cannot be proven locally. They are pre-deployment checks, never planning tasks. The Phase 2 Salesforce smoke gate validates the assumed sandbox capabilities and sample records before Salesforce integration begins.
