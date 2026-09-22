---
id: WU-003
title: Deliver the Phase 2 Salesforce core
status: active
plan_sections: [3, 7, 8, 10, 11, 14, 15, 16, 17]
owners: [agent]
---

# Objective

Deliver a Salesforce-backed vertical slice in which an authenticated evaluator connects to the curated Salesforce MCP surface with per-user OAuth, invokes read and draft agents through the orchestrator, reviews campaign readiness, and explicitly confirms one idempotent sandbox review-request write that is read back from Salesforce.

## Scope

- In-scope paths: `salesforce/`, `apps/edge/`, `apps/web/`, `packages/contracts/`, `packages/ui/`, `packages/evals/`, `scripts/`, `infra/cloudflare/pot/`, Phase 2 tests, documentation, and evidence.
- Explicitly out of scope: production orgs/data, HXL widgets, image generation, publish/send/activate/delete/suppress, buyer-group mutation, unrestricted SObject tools, and service-account Salesforce access.
- Prerequisites: an explicitly identified Northstar Salesforce sandbox with sample CRM, Marketing Cloud Next, and Data 360 data; evaluator OAuth consent; a Salesforce custom Hosted MCP server; and a Cloudflare MCP portal URL.

## Contracts affected

- Schemas: connector state, curated tool definitions, campaign evidence, readiness result, confirmation, write result, and Salesforce error codes.
- Tools/actions: the focused Phase 2 catalog in `packages/contracts/src/tool-catalog.json`; only `save_campaign_brief` and `create_campaign_review_request` are write-capable in this phase.
- Tiles/HXL: native campaign brief, readiness, performance, account-signal, and content-draft tiles. HXL is Phase 3.
- External state: Salesforce sandbox metadata and activation, External Client App, custom Hosted MCP server, Cloudflare portal upstream/tool allowlist, Worker variables, and evaluator OAuth grant.
- Existing-org boundary: all artifacts that predate this work unit are read-only. Create separately named Northstar agents, users, assignments, MCP server, External Client Application, and proof records; do not repurpose or modify Fizi, Agent Two, existing MCP servers, existing External Client Applications, or other pre-existing org state without explicit permission.

## Acceptance criteria

- [x] Campaign Creation, Content Builder, Account Discovery, and Campaign Readiness Agent Script sources are versioned and pass Agentforce validation.
- [x] Deterministic Apex/Flow actions cover success, empty, permission denied, validation, idempotent replay, and confirmation-boundary behavior.
- [x] The custom Hosted MCP manifest exposes only the approved, focused catalog and excludes broad mutation surfaces.
- [ ] Per-user OAuth connection, reconnect, expired-auth, permission-denied, and recovery states are implemented without browser-stored provider tokens.
- [x] The orchestrator can use discovered read/draft MCP tools while write tools remain unavailable to autonomous model execution.
- [x] A five-minute same-user confirmation binds action, scope, request hash, and idempotency key; confirmed execution reads back the authoritative Salesforce result.
- [x] Local fixtures demonstrate account discovery, campaign/content drafting, readiness, and confirmed review-request behavior without claiming live Salesforce state.
- [ ] Sandbox smoke checks cover evaluator permissions, one business unit, one data space, consent/identity behavior, standard agents, and representative records. Live aggregate read-back proves the active business unit/data space, CRM records, and identity links, but the checked consent stores contain zero sample records.
- [x] Direct Streamable HTTP Postman/MCP protocol evidence precedes Cloudflare portal/model evidence.
- [x] Documentation and evidence distinguish local demonstrated behavior from the live deployment gate.
- [x] No proof boundary or Section 17 default changed.

## Verification

```text
pnpm sf:metadata:check
pnpm sf:validate
pnpm verify:fast
pnpm verify
pnpm test:e2e
```

Live gate commands require an explicitly supplied Northstar sandbox alias and ephemeral evaluator OAuth. They must fail closed when those inputs are absent.

## External mutations

Intended mutations are limited to deploying and activating source-controlled metadata in the supplied Northstar sandbox, configuring its External Client App and custom Hosted MCP server, registering that upstream in the proof Cloudflare MCP portal, and creating one confirmed sample review task. Read-back uses Metadata API/source retrieval, MCP `tools/list` and fixed tool calls, Salesforce record queries, Cloudflare portal catalog inspection, and Worker diagnostics. No currently authorized org is assumed to be the Northstar sandbox.

## Evidence

- Reports: `artifacts/reports/WU-003/` records source-contract, invariant, documentation, routing-evaluation, full verification, exact-target Salesforce smoke, metadata deployment, Apex, and Cloudflare gates. `salesforce-live.json`, `cloudflare-live.json`, and `cloudflare-mcp-protocol.json` separate completed live evidence, the confirmation-boundary incident/remediation, and remaining gates.
- Screenshots: `artifacts/evidence/WU-003/confirmation-{chrome,edge}.png` and `workbench-{chrome,edge}.png` capture the explicit confirmation and durable read-back journeys. Both Playwright projects passed on 2026-09-20.
- Local verification: the latest unrestricted `pnpm verify` run passed all 11 local gates, including 10 unit tests, 10 Worker tests, 20/20 routing evaluations, the Salesforce metadata contract, and the production build. `pnpm test:e2e` previously passed 2/2 browser projects. `SF_TARGET_ORG=northstar-pot SF_APPROVED_PROOF_ORG_ID=00DjV000001wjXLUAY pnpm sf:validate` proved the exact approved org, Campaign and Account samples, active business unit and data space, queryable consent surfaces, 506 identity links, and Agent Script availability, then correctly exited nonzero because all checked consent stores contain zero representative records. `sf project convert source --root-dir salesforce/force-app --output-dir /tmp/northstar-phase2-mdapi --json` completed successfully as an offline Metadata API conversion check.
- Salesforce deployment: `0AfjV000002VVj9SAG` created the initial six Northstar API 67.0 Apex classes, Activity and Campaign idempotency fields, and evaluator permission set. Agentforce Builder then committed and activated `Campaign Readiness and Governance` Version 1. After the live portal negative test exposed unauthenticated confirmation fields, targeted validation `0AfjV000002ZvYXSA0` and deployment `0AfjV000002ZvezSAC` added `NorthstarConfirmationVerifier`, the net-new hierarchy setting, and HMAC fields to both writes. Test run `707jV000003vP0F` passed 9/9, including a forged-signature case that creates zero Tasks.
- Read-back results: Tooling API returned all six Northstar Apex classes as Active at API 67.0, and SOQL returned `Northstar_Marketing_Workbench_Evaluator`. The approved evaluator assignment query returned exactly one matching assignment for `andrew.bauer@marketing.demo.aug31`. Salesforce created dedicated active user `005jV000002ABc9QAG` with the `Einstein Agent User` profile and assigned it to Bot `0XxjV000000YDVtSAO`; the Fizi user was not reused. Metadata retrieval `09SjV000006g7rFUAQ` returned the active custom Bot, Version 1, and authoring bundle. Retrievals `09SjV000006g8IfUAI` and `09SjV000006g8VZUAY` returned the three dedicated Northstar standard Bot, BotVersion, and Agent Script sources. Agentforce Builder reports `Northstar_Campaign_Creation` Version 1 active, and `sf agent validate authoring-bundle` passed for `Northstar_Campaign_Creation`, `Northstar_Content_Builder`, `Northstar_Account_Discovery`, and the custom readiness agent. Apex tests prove the two idempotency fields through USER_MODE success and permission-denied paths.
- Hosted MCP and OAuth: the net-new `NorthstarMarketingWorkbench` definition contains the complete 13-tool catalog: 11 narrowly named agent-backed tools referencing only the four Northstar agents plus `save_campaign_brief` and `create_campaign_review_request`, each bound to a globally discoverable Apex Invocable Action, marked non-read-only and idempotent, and still excluded from autonomous model execution. Validation-only deployment `0AfjV000002YP66SAG` passed after `0AfjV000002YQerSAG` safely identified the Apex operation-name requirement; neither check-only deployment changed org state. Live deployment `0AfjV000002YQyDSAW` updated only the two Northstar classes and server `1g1jV0000000rIrQAI`. Tooling API read-back returned exactly 13 tools and 13 bindings, including `aa:apex-NorthstarSaveCampaignBrief` and `aa:apex-NorthstarCreateCampaignReviewRequest`. Apex test run `707jV000003ssRhQAI` completed all seven methods successfully. The earlier deployment/retrieval and ECA evidence remains valid: `0AfjV000002Y3f4SAC`, `09SjV000006izE1UAI`, `0AfjV000002YPcLSAW`, `0AfjV000002YQIHSA4`, and `09SjV000006izVlUAI`. Tooling activation created only `McpServerAccess` `1fzjV000000i4zBQAQ` for the net-new server and read it back with `Active=true`. An evaluator PKCE grant passed direct Streamable HTTP initialization, the initialized notification, exact 13-tool discovery, a sample readiness call, and rejection of an unconfirmed review-request write. After compatibility deployment, a fully populated five-field forged token was also rejected through the live Hosted MCP action; SOQL read-back returned zero Tasks for its unique idempotency key. No token is checked in. `Cloudflare_MCP` and both existing MCP servers remain outside the proof.
- Representative data: aggregate-only queries found one active `default Business Unit` linked to one active `default` Data 360 data space, 30 Campaigns, 83 Accounts, 12 core Individuals, and 506 Data 360 individual/identity-link rows. `ContactPointTypeConsent`, `ContactPointConsent`, `CommSubscriptionConsent`, `PartyConsent`, and `ssot__CommunicationSubscriptionConsent__dlm` each returned zero records. The smoke validator now fails this assumption explicitly instead of treating queryability as sample-data proof.
- Cloudflare deployment: the checked-in D1 confirmation-audit migration is applied and read back. Worker version `5f362c58-5294-4f4a-949d-cd6d3e1b8b65` (v11) contains the portal URL, secret confirmation-signing binding, and versioned signed-token transport. Evaluator PKCE OAuth, initialize/initialized, enabled-server discovery, exact 13-tool synchronization, and campaign-readiness execution passed through the Access-protected portal. The reusable `AWB` policy remains unchanged on the dedicated portal and server applications. A fabricated-confirmation negative test created Task `00TjV000000pyVBUAY`, proving the former Apex presence-only checks were insufficient. The Task was authoritatively read back and not deleted. Both writes were disabled during remediation, then re-enabled only after the live five-field Apex contract matched Cloudflare's immutable manual-OAuth schema. Matching proof secrets are configured in Salesforce and the Worker without source-control exposure.
- Known limitations: `northstar-pot` is production-classified by Salesforce but is treated as the dedicated proof org by explicit user instruction and exact runtime org-ID binding; see ADR-003. Five CLI publish attempts timed out at the Agentforce authoring endpoint, but the approved Agentforce Builder path completed the custom agent lifecycle. Marketing Cloud, Data Cloud, deployed data streams, Agentforce, and generative AI are active. Northstar Campaign Creation, Northstar Content Builder, and Northstar Account Discovery are active and their generated Agent Script sources are versioned. The pre-existing Fizi agent is outside this proof and was not modified. The active Hosted MCP server, portal read path, cryptographic confirmation verifier, confirmation-audit schema, and Worker portal binding are live and read back. Evaluator authorization through the Worker plus the authoritative live confirmed write/read-back remain pending. Representative consent data is absent; the proof will not manufacture consent records outside its allowed writes.

## Completion

- Final status: active
- Commit chain: `2b9e580` through `de2660e` on `feat/phase-2-salesforce-core`; subsequent evidence updates remain on the same Phase 2 pull request.
- Summary: implementation in progress; do not treat local fixtures as Salesforce proof.
