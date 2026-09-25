# Agentic Marketing Workbench — Full-Stack Implementation Plan

Status: proof-of-technology plan; architecture decisions complete

Research snapshot: September 19, 2026

Primary users: a small sandbox evaluation team of marketers and developers

## 1. Outcome

Build and demonstrate a secure React proof of technology where a marketer works through one conversational orchestrator, sees evidence-backed insight tiles beside the conversation, delegates Salesforce work through Cloudflare's MCP control plane, and generates draft campaign images with Cloudflare Workers AI.

The product is not another generic chatbot. It is a governed marketing workbench with four explicit responsibilities:

1. Understand a marketer's goal and assemble the required context.
2. Delegate domain work to specialized agents and deterministic tools.
3. Render structured, actionable results as portable tiles, including Salesforce HXL widgets where supported.
4. Require explicit user confirmation before the limited reversible sandbox writes allowed by the proof.

### Success criteria

- A marketer can ask, “Why is the fall campaign underperforming, and what should I change?” and receive a sourced cross-channel answer plus tiles for performance, audience, content, and recommended actions.
- A marketer can create or refine a brief and campaign without switching into Salesforce for routine steps.
- The orchestrator can call Salesforce through one curated Cloudflare MCP server portal and invoke a governed first-party Workers AI image tool.
- Salesforce-backed cards render from Custom Lightning Types and HXL on compatible MCP Apps surfaces; all tiles have a native React fallback.
- No write occurs without authorization, validation, an idempotency key, and an auditable confirmation event.
- Every claim shows source, freshness, and whether it is observed data, an agent inference, or a proposed action.

## 2. Current product reality and design implications

### Cloudflare terminology

The current Cloudflare product is **MCP server portals**, formerly called Agents Gateway. A portal consolidates remote MCP servers behind one endpoint, applies Access policy, curates tools and prompts, and can optionally route calls through **Cloudflare Gateway** for HTTP logging and DLP. These are separate capabilities; the architecture must not call the whole stack “MCP Gateway.” The portal supports stateless MCP `2026-07-28` and earlier Streamable HTTP clients. See [Cloudflare MCP server portals](https://developers.cloudflare.com/cloudflare-one/access-controls/ai-controls/mcp-portals/) and the [August 2026 protocol update](https://developers.cloudflare.com/changelog/post/2026-08-25-mcp-portals-mcp-2026-07-28/).

### Salesforce marketing agents

The current generally usable Marketing Cloud Next agent set includes Campaign Creation, Content Builder, Account Discovery, Distributed Marketing, and Journey Decisioning for Marketing Cloud Engagement+. Salesforce publishes the associated standard actions, which should be reused rather than reimplemented. See [Enable AI Features in Marketing Cloud Next](https://help.salesforce.com/s/articleView?id=sf.mktg_admin_setup_einstein.htm&language=en_US&type=5).

Winter ’27 release notes add Marketing Goals Agent, Agentforce Content Agent, and Buyer Engagement Agent, but those capabilities are preview-only as of this plan's date. The proof uses only features in the sandbox's current generally available production release: Campaign Creation, Account Discovery, Content Builder, and their current standard actions. Preview agents are excluded rather than feature-flagged.

Marketing Cloud Next is also called Agentforce Marketing in current release notes. Use “Marketing Cloud Next (Agentforce Marketing)” consistently in the proof UI and documentation.

### Agent Script and MCP exposure

Agent Script is Salesforce's current language for deterministic Agentforce workflows. Since April 2026, “topics” are called **subagents**. It supports variables, conditions, deterministic action chaining, and LLM-selected tools. See [Agent Script](https://developer.salesforce.com/docs/ai/agentforce/guide/agent-script.html) and the [language reference](https://developer.salesforce.com/docs/ai/agentforce/guide/ascript-reference.html).

Salesforce Hosted MCP Servers are the preferred boundary for Salesforce data, Flow, Apex, Prompt Builder, Data 360, Tableau, and Agentforce. Only agents created with the new Agent Script Builder can be exposed as agent-backed tools, and each agent or prompt must be explicitly added to a custom MCP server. See [Salesforce Hosted MCP Servers](https://developer.salesforce.com/docs/platform/hosted-mcp-servers/guide/hosted-mcp-servers-overview.html) and [Agentforce-backed MCP tools](https://developer.salesforce.com/docs/platform/hosted-mcp-servers/guide/agentforce.html).

### HXL maturity

Headless Experience Layer (HXL) is beta in API version 67.0+. HXL widgets are compatible with MCP Apps, and current Salesforce documentation names Agentforce, ChatGPT, Claude, and Slackbot as supported surfaces. A custom React workbench must therefore implement the MCP Apps host contract; it cannot assume that raw HXL JSON can simply be rendered as arbitrary React. Keep a structured-data fallback because HXL availability, component support, and client compatibility can change during beta. See [HXL prerequisites](https://developer.salesforce.com/docs/platform/hxl/guide/prerequisites.html), [HXL with MCP clients](https://developer.salesforce.com/docs/platform/hxl/guide/hxl-mcp-channels.html), and the [MCP Apps host architecture](https://github.com/modelcontextprotocol/ext-apps/blob/main/docs/overview.md).

## 3. Scope

### Proof-of-technology scope

- Employee-facing responsive React web application.
- Cloudflare Access authentication and tenant/workspace authorization.
- One persistent chat orchestrator per authenticated principal and workspace.
- Salesforce Marketing Cloud Next and CRM via Salesforce Hosted MCP Servers.
- Four initial Salesforce agent capabilities:
  - Campaign Creation.
  - Content Builder.
  - Account Discovery.
  - Custom Campaign Readiness and Governance Agent.
- One orchestrator-owned Workers AI tool for generating reviewable campaign-image variants from an approved Salesforce campaign brief.
- Insight tiles, activity timeline, citations/evidence, connection management, and confirmation UI.
- HXL/MCP Apps output rendering for Salesforce cards plus native React tile fallbacks.
- One sandbox demonstration deployment with focused tests, diagnostic telemetry, and a teardown procedure.

### Later releases

- Marketing Goals Agent, Agentforce Content Agent, and Buyer Engagement Agent after org availability is confirmed.
- Slack, Teams, mobile push, and voice interaction surfaces.
- Proactive alerts and scheduled optimization runs.
- Paid-media, external analytics, DAM/CMS, project management, experimentation, and data-warehouse connectors.
- Autonomous actions beyond narrowly approved policies.

### Explicitly out of scope for the proof

- Replacing Salesforce campaign, consent, identity, or journey systems of record.
- Re-creating Salesforce standard marketing agents on Cloudflare.
- Letting the orchestrator issue unrestricted CRUD, arbitrary SOQL, arbitrary Apex, or direct ad-spend changes.
- Treating a model-generated recommendation as an approved marketing decision.
- Depending on a Winter ’27 preview feature for a critical path.
- Journey creation or activation.
- External paid-media or analytics integrations.
- External creative suites or DAM integrations.

### Proof environment assumptions and delivery gates

The implementation uses one provided Salesforce sandbox on the current generally available production release. Assume all Salesforce licensing required for CRM, Marketing Cloud Next, Data 360, Agentforce, Salesforce Hosted MCP Servers, standard marketing agents, Flex Credits, and HXL is available, with representative CRM/marketing/Data 360 sample data. The proof does not include license discovery, procurement, a production org, or release-preview testing.

The Phase 2 gate performs only a smoke check that the assumed features, permissions, identity/consent configuration, and sample records work for the evaluator user. Phase 3 separately verifies HXL/API compatibility. A failed assumption stops the proof; the team does not create substitute platform capabilities.

The Phase 4 pre-deployment gate verifies that the target Cloudflare account can run the chosen Workers AI image model through an `AI` binding and has the R2 capacity and lifecycle policy needed for generated drafts. The model ID remains an environment variable for operational replacement, but the proof evaluates only the selected model and exposes no model picker.

## 4. Target architecture

```text
Browser
  React workbench + MCP Apps host
  |  Access JWT + WebSocket/HTTPS
  v
Cloudflare Worker
  request auth, routing, static assets, API, webhooks
  |
  +--> MarketingOrchestrator (Agents SDK / Durable Object)
  |      conversation state, tool policy, confirmations, tile state
  |      |
  |      +--> model through Cloudflare AI Gateway
  |      +--> Workers AI image generation binding
  |      |
  |      +--> Cloudflare MCP server portal
  |             Access policy, tool curation, aliases, logs
  |             |
  |             +--> Salesforce custom Hosted MCP Server
  |             |      Agentforce Agent Script agents
  |             |      Flow / Apex / Prompt Builder
  |             |      CRM / Marketing Cloud Next / Data 360
  |             |      CLT + HXL/MCP Apps resources
  |             |
  |             +--> Salesforce read-only standard servers
  |             |      SObject Reads / Data 360
  |             |
  |
  +--> D1 for cross-session indexes and audit metadata
  +--> R2 for generated image variants and approved artifacts
```

### Product boundaries

- **Salesforce Platform:** Campaign and CRM work records, Flow orchestration, review records, agent definitions, and action implementations.
- **Data 360:** harmonized customer data, identity resolution, segments, data graphs, and contact-point consent context.
- **Marketing Cloud Next:** campaign flow and channel execution.
- **Cloudflare orchestrator:** conversation, cross-system routing, policy enforcement, evidence assembly, confirmation UX, and portable tile state.
- **Workers AI + R2:** generate and retain derived image drafts. The selected image becomes authoritative only after the approved asset is attached to the Salesforce campaign or content asset library through a supported action.
- **Source systems:** Salesforce remains authoritative for campaigns, content references, consent, and customer identity. The workbench owns only conversation state and generated draft artifacts.

Commercial send eligibility must use the Data 360 Communication Subscription Consent model and resolve the individual to a contact point; a custom CRM boolean is not an acceptable substitute.

## 5. React application

### Information architecture

Use a three-region desktop layout and a stacked mobile layout:

1. **Workspace rail**
   - Workspaces and recent conversations.
   - Connected source status.
   - Saved campaigns and pinned tiles.
   - Agent/capability catalog, expressed in marketer language rather than vendor agent names.

2. **Conversation canvas**
   - Streaming user/assistant messages.
   - Tool activity grouped under a concise “Working across 3 sources” disclosure.
   - Agent delegation badges and source/freshness metadata.
   - Inline clarification prompts.
   - Approval cards for consequential actions.
   - Recoverable states for reconnect, timeout, expired OAuth, and field-policy block.

3. **Insight board**
   - Responsive tiles emitted by agents and tools.
   - Filters for campaign, period, brand, business unit, and source.
   - Pin, compare, refresh, open in source, and explain actions.
   - Evidence drawer showing inputs, provenance, generated-at time, and reasoning summary without exposing hidden chain-of-thought.

### Core user journeys

#### Campaign planning

1. User asks for a campaign for a stated audience and objective.
2. Orchestrator retrieves existing campaigns, audience availability, brand guidance, and recent performance.
3. Campaign Creation agent drafts a brief and preview.
4. UI renders campaign brief, audience, content preview, and readiness tiles.
5. User refines through chat.
6. Saving the brief/campaign requires confirmation and returns a Salesforce record link.

#### Campaign creative production

1. User selects a Salesforce campaign or brief and asks for a campaign image.
2. Orchestrator retrieves the campaign message, audience, channel, brand, and required dimensions from Salesforce.
3. Orchestrator constructs a bounded image prompt from approved campaign fields and brand guardrails; it excludes customer-level data.
4. An internal `generate_campaign_image` tool calls Workers AI and stores the returned image in a quarantined R2 draft prefix.
5. UI renders one or more generated-image tiles with model, prompt summary, seed when available, dimensions, and generation time.
6. User can reject, revise the prompt, or select a variant.
7. Attaching the selected image to the Salesforce campaign or content asset library requires explicit confirmation, applicable content checks, and authoritative read-back.

#### Account and buyer-group discovery

1. User asks which accounts or contacts to nurture.
2. Account Discovery returns scores, recent activities, conversation summaries, and proposed buyer-group members.
3. UI renders an account insight and buyer-group shortlist.
4. Adding a member or starting a campaign is a separately approved mutation.

### Frontend technical design

- React + TypeScript + Vite.
- `useAgentChat` is the single browser owner of submission, streaming, replay, and reconciliation.
- `useAgent` handles typed state and RPC that are not chat messages.
- Use TanStack Query for ordinary HTTP configuration endpoints, but never as a second owner of the chat transcript.
- Zod schemas validate every tool result and tile payload at the browser boundary.
- Accessible components meet WCAG 2.2 AA: keyboard navigation, focus management, non-color status cues, reduced-motion support, semantic headings, and live-region treatment for streamed updates.
- The app must support abort/cancel and resumable streaming.
- URL-addressable workspaces and conversations allow deep links without exposing raw external identifiers.

### Tile contract

All outputs are normalized into a host-owned envelope even when the visual is supplied by MCP Apps/HXL:

```ts
type InsightTile = {
  id: string;
  conversationId: string;
  kind: "kpi" | "table" | "brief" | "audience" | "content" |
        "journey" | "creative" | "alert" | "approval" | "external-app";
  source: { system: string; agent?: string; tool: string };
  title: string;
  summary?: string;
  status: "fresh" | "stale" | "running" | "blocked" | "error";
  generatedAt: string;
  freshness?: { observedAt?: string; expiresAt?: string };
  evidence: Array<{
    label: string;
    href?: string;
    recordRef?: string;
    claimType: "observed" | "inferred" | "proposed";
  }>;
  structuredContent?: unknown;
  mcpApp?: { resourceUri: string; serverId: string };
  actions: Array<{
    id: string;
    label: string;
    effect: "read" | "draft" | "write" | "publish" | "activate";
    approvalRequired: boolean;
  }>;
};
```

### HXL and MCP Apps rendering

The React application acts as an MCP Apps host:

- Advertise the `io.modelcontextprotocol/ui` extension and `text/html;profile=mcp-app` MIME support during MCP initialization.
- Use `@modelcontextprotocol/ext-apps/app-bridge` to communicate with each sandboxed view through a distinct bridge; do not leak the outer MCP connection into an iframe.
- Render views in sandboxed iframes with the resource-declared CSP and a strict host allowlist.
- Pass theme, locale, timezone, display mode, and container dimensions.
- Permit app-to-server calls only for tools with appropriate MCP Apps visibility.
- Show source and approval chrome outside the iframe so an embedded app cannot spoof trust state.
- If the client, portal, server, or widget does not negotiate MCP Apps, render `structuredContent` through the native tile registry.

Native tile components remain necessary for non-HXL sources, accessibility control, comparison views, and graceful fallback.

## 6. Cloudflare application layer

### Worker and Agents SDK

Create `MarketingOrchestrator extends AIChatAgent<Env>` and route instances by a server-derived key such as `tenantId:userId:workspaceId`. Never accept the Durable Object instance name directly from the browser.

Responsibilities:

- Persist server-authoritative messages and current tile state.
- Connect to the MCP portal using the Agents SDK MCP client.
- Maintain a small orchestrator system contract: classify request, gather evidence, delegate, synthesize, request approval, execute, and verify.
- Enforce tool-level policy before a tool is included in a model turn.
- Convert raw results into `InsightTile` envelopes.
- Stream text and tile events independently so a slow tile does not block the answer.
- Forward cancellation signals to model and upstream calls.
- Attach a correlation ID to the message, model call, portal call, upstream tool call, approval, and audit event.
- Persist idempotency keys for every mutation.

Do not let the model see an unbounded raw MCP catalog. Cap the proof portal at 20 narrowly described tools and prompts, limited to the capabilities named in this plan. Do not use `minimize_tools`, `search_and_execute`, or Code Mode in the proof.

### Model layer

- Use Cloudflare-hosted `@cf/openai/gpt-oss-20b` as the orchestrator model. It supports function calling and reasoning while keeping the proof on one platform and avoiding another provider credential.
- Route inference through Cloudflare AI Gateway for request logging and cost visibility.
- Keep prompts versioned in the repository.
- Limit each turn to eight tool calls and a 60-second wall-clock budget.
- Do not add model routing or a second summarization model in the proof.

### Campaign image generation tool

Keep image generation inside the Cloudflare application rather than inventing an MCP server for a first-party binding. The orchestrator owns a narrow `generate_campaign_image` tool and invokes Workers AI with `env.AI.run()`.

- Set `CAMPAIGN_IMAGE_MODEL=@cf/black-forest-labs/flux-2-klein-4b`. Generate one 1024×1024 PNG per request; do not add model selection, alternate dimensions, or reference-image editing to the proof.
- Accept only a campaign ID, bounded prompt, channel, and optional seed. Never place customer-level data, audience members, contact details, or unrestricted CRM text in an image prompt.
- Compile the prompt from allowlisted campaign and brand fields. Treat retrieved text as data and strip embedded instructions before generation.
- Validate the returned media type, byte size, and dimensions; calculate a content hash; then store the image under an R2 draft key such as `drafts/{tenantId}/{conversationId}/{imageId}`.
- Persist model ID, prompt version and summary, seed when returned, dimensions, hash, R2 key, creator, campaign reference, and lifecycle state in D1/audit storage.
- Return a native `generatedCampaignImageCard` with a short-lived authorized image URL. Generated images are drafts, not approved brand assets.
- Make orchestration observable in the workbench: show the host decision summary, curated tool discovery, Salesforce-agent and host-owned tool calls, lifecycle state, source/read-back boundary, and expandable sanitized request/response payloads. Never expose credentials, confirmation material, customer PII, or private model chain-of-thought.
- Require a human to select a variant and separately confirm its attachment to Salesforce. The attachment action performs applicable content checks and reads back the authoritative asset reference.
- Cap the proof at 100 generated images or USD 25 of Workers AI image spend, whichever comes first, with one in-flight generation per user. A retry creates a new record rather than overwriting a variant.
- Delete every R2 image object after seven days, including a selected variant after it has been attached to Salesforce. Reference images are disabled.

Do not promise reliable logo placement, readable typography, exact product reproduction, or production-ready brand compliance from a general image model. The proof produces reviewable visual drafts; deterministic template composition or a DAM/creative-suite integration remains a later capability.

### Durable and asynchronous work

- **Durable Object agent storage:** transcript, tile state, pending confirmations, portal connection metadata, and per-conversation SQL.
- **D1:** workspace configuration, connector catalog, tool policy, confirmation/audit index, and cross-conversation search metadata.
- **R2:** generated image drafts with a seven-day lifecycle; Salesforce holds the durable content-asset reference after confirmed attachment.
- **Secrets Store / Worker secrets:** service credentials. Never store provider tokens in browser storage or ordinary D1 columns.

Cloudflare Workflows, Queues, Vectorize, and additional storage services are deliberately excluded until the proof demonstrates a concrete need.

## 7. MCP server portal and server configuration

### Portal topology

Provision one proof portal, `mcp-marketing-pot.example.com`, connected only to the Salesforce sandbox. Record its portal settings, Access policy, upstream server IDs, OAuth configuration, and tool allowlist in `infra/cloudflare/pot/README.md`; production-grade Terraform and multi-environment promotion are out of scope.

Use the MCP server portal for aggregation, OAuth, tool curation, and request logs. Do not enable the optional Cloudflare Gateway DLP hop for this sample-data proof; validate schema-level redaction in the Worker instead.

### Authentication model

- Protect the web app and portal with Cloudflare Access email one-time PIN, restricted to an explicit evaluator email allowlist.
- Validate the Access JWT in the Worker and derive tenant/user/group claims server-side.
- For Salesforce, configure an External Client App with OAuth 2.0 authorization code + PKCE and the `mcp_api` scope. Connected Apps are not the supported MCP client registration path.
- Keep `Require user auth` enabled (`on_behalf = true`) for Salesforce so upstream permissions follow the user.
- Use two application roles: `evaluator` and `demo-admin`. An evaluator can read, draft, and confirm the limited reversible writes; the demo admin can reconnect OAuth, inspect diagnostics, and disable tools.
- Do not use service tokens or headless jobs in the proof.

### Upstream servers

#### Salesforce

1. **Custom `marketing-workbench` Hosted MCP Server**
   - Agent-backed tools for each exposed Agent Script agent.
   - Focused Flow/Apex tools for deterministic reads and the three allowed mutation types.
   - Prompt templates that must remain inside the Einstein Trust Layer.
   - HXL widget resources and tool-to-resource mappings.

2. **SObject Reads standard server**
   - Read-only CRM discovery and record lookup.
   - Do not add SObject All, Deletes, or broad mutation servers to the default portal.

3. **Data 360 standard server**
   - Unified customer and audience queries against the supplied sample data.

Headless 360 is beta and offers very broad setup/platform actions. Exclude it from the proof portal. Broad administrative discovery/dispatch is not an appropriate surface for this demonstration.

#### Image generation is not an MCP upstream

The proof calls the Workers AI binding directly from the orchestrator. Wrapping that first-party binding in a custom MCP server would add another protocol and authorization boundary without improving discovery or governance. The MCP portal remains the predominant integration boundary for Salesforce agents and tools; the small image tool remains host-owned and policy-enforced alongside confirmations and R2 storage.

### Portal policy

- Curate and alias tools so names describe a single job.
- Hide primitive mutation tools from model context.
- Apply Access policies at both the portal and each registered upstream server.
- Protect custom upstreams with Access as the OAuth provider so direct URLs cannot bypass portal policy.
- Keep optional Gateway routing and DLP disabled for the proof; the sandbox contains sample data only and the Worker blocks customer PII from model and image prompts.
- Retain portal and Worker diagnostic logs for 14 days; no SIEM export is required.
- Monitor admin OAuth token health because portal server credentials can expire without notification.

### Tool contract requirements

Every tool must publish:

- Narrow name and unambiguous description.
- JSON schema with constrained enums and bounded strings.
- Declared effect classification: read, draft, write, publish, activate, or destructive.
- Required permission and data classification.
- Idempotency behavior.
- Timeout and retry policy.
- Structured error codes: `AUTH_REQUIRED`, `PERMISSION_DENIED`, `FIELD_POLICY_BLOCKED`, `VALIDATION_FAILED`, `CONFIRMATION_REQUIRED`, `RATE_LIMITED`, `UPSTREAM_UNAVAILABLE`, and `CONFLICT`.
- Source record references and observation time.
- HXL/MCP Apps resource URI when a portable UI is available.

## 8. Salesforce Agentforce plan

### Org prerequisites

- Assume all required Salesforce editions, products, licenses, Flex Credits, and HXL access are present in the supplied current-release sandbox; do not spend proof time on entitlement analysis.
- Smoke-test Marketing Cloud Next, Data 360 data kits, identity resolution, consent, business units, generative AI, standard agents, Hosted MCP Servers, and representative sample records with one evaluator user.
- Assign one proof-specific least-privilege permission set based on Marketing Team Agent Access.
- Create or verify the External Client App used by the workbench and enable HXL in this sandbox.
- Create an SFDX project using API version 67.0+ and keep all Agent Script, Flow, Apex, MCP server, Lightning Type, and UiWidget metadata in source control.

### Standard agent capabilities

For each capability below, create or instantiate the agent in the **new Agent Script Builder**, retrieve its authoring bundle into the SFDX project, and keep the resulting Agent Script under source control. Reuse Salesforce's standard actions inside those scripts; “build with Agent Script” does not mean cloning Salesforce's Flow/Apex implementation. If an installed template is still legacy-only in the target org, do not expose it directly through MCP. Create a thin new-builder Agent Script agent around the supported standard actions or hold that capability until it can be upgraded.

#### 1. Campaign Creation

Use Salesforce's standard actions for drafting and saving briefs/campaigns, refining campaign preview, summarizing a campaign, identifying business unit, and generating campaign insights. Modify the underlying Flow only for required custom fields, approval steps, owner assignment, or supported integration logic.

Expose focused MCP tools rather than one vague “run campaign agent” tool:

- `draft_campaign_brief`
- `refine_campaign_preview`
- `summarize_campaign`
- `generate_campaign_insights`
- `save_campaign_brief` — approval required
- `create_campaign_from_brief` — approval required

#### 2. Content Builder

Use the standard draft content, create section, and create section with content actions. Ground output in the campaign brief, assigned brand, and approved Salesforce content assets. Keep publishing separate from drafting.

Expose:

- `draft_campaign_content`
- `create_content_section`
- `validate_content_against_brand`

#### 3. Account Discovery

Use the standard actions for marketing scores, recent activities, conversation summaries, and proposed buyer-group members.

Expose:

- `get_account_marketing_signals`
- `recommend_buyer_group_members`
- `summarize_account_engagement`

Journey Decisioning, Distributed Marketing, Winter ’27 preview agents, content publication, buyer-group mutation, send, activation, and deletion are excluded from the proof's tool catalog.

### Custom agent: Campaign Readiness and Governance

Purpose: evaluate whether a campaign is ready to move from draft to review and return a portable readiness card with blockers and evidence.

Subagents:

1. `campaign_intake` — identifies campaign, business unit, objective, owner, and intended channels.
2. `audience_and_consent` — checks segment availability, contact-point resolution, communication subscription consent coverage, exclusions, and suppression rules.
3. `brand_and_content` — validates required assets, brand grounding, localization, accessibility, links, and channel constraints.
4. `creative_assets` — checks the Salesforce campaign's required image slots, dimensions, current asset references, and any selected R2 draft or approved Salesforce content-asset reference supplied by the Cloudflare orchestrator.
5. `approval_and_handoff` — assembles blockers, warnings, approvers, and next allowed actions.

Deterministic actions:

- `GetCampaignContext` Flow.
- `GetAudienceAndConsentSummary` Apex/Named Query action.
- `ValidateCampaignContent` Flow or Apex action.
- `GenerateBrandAssessment` Prompt Template action.
- `GetApprovalState` Flow.
- `CreateCampaignReviewRequest` Flow, with user confirmation.

Agent Script blueprint (validate names and generated metadata against the target org before deployment):

```agentscript
variables:
   campaign_id: mutable string = ""
   campaign_loaded: mutable boolean = False
   consent_passed: mutable boolean = False
   content_passed: mutable boolean = False
   review_required: mutable boolean = True

start_agent agent_router:
   description: "Routes campaign readiness requests"
   reasoning:
      instructions: |
         Select the tool that matches the user's request. Readiness review must
         start with campaign intake.
      actions:
         go_to_campaign_intake: @utils.transition to @subagent.campaign_intake

subagent campaign_intake:
   description: "Loads the campaign and establishes its review context"
   actions:
      get_campaign_context:
         description: "Read campaign, brief, flow, business unit, channels, and owner"
         inputs:
            campaign_id: string
               is_required: True
         outputs:
            campaign_id: string
               description: "The resolved Salesforce Campaign ID"
            readiness_context: object
               complex_data_type_name: "c__campaignReadinessContext"
         target: "flow://GetCampaignContext"
   reasoning:
      instructions: ->
         if not @variables.campaign_loaded:
            | Identify the campaign, then call {!@actions.get_campaign_context}.
         else:
            transition to @subagent.audience_and_consent
      actions:
         load_campaign: @actions.get_campaign_context
            with campaign_id=...
            set @variables.campaign_id = @outputs.campaign_id
            set @variables.campaign_loaded = True

subagent audience_and_consent:
   description: "Evaluates audience resolution and consent eligibility"
   # Define and run GetAudienceAndConsentSummary, then transition deterministically.

subagent brand_and_content:
   description: "Validates content completeness, brand, localization, and accessibility"
   # Define ValidateCampaignContent and GenerateBrandAssessment actions.

subagent approval_and_handoff:
   description: "Returns the governed readiness result and can request review"
   actions:
      create_review_request:
         description: "Creates a review request after the user confirms"
         require_user_confirmation: True
         inputs:
            campaign_id: string
               is_required: True
         outputs:
            readiness_result: object
               complex_data_type_name: "c__campaignReadinessResult"
               filter_from_agent: False
               is_displayable: True
         target: "flow://CreateCampaignReviewRequest"
```

The proof implementation must include explicit error branches, empty-result handling, business-unit authorization, and an auditable rejection path. Action chaining may prepare evidence, but a chain must never cross a confirmation boundary automatically.

## 9. Custom Lightning Types and HXL cards

### Initial widget catalog

- `campaignBriefCard`
- `campaignReadinessCard`
- `buyerGroupShortlist`
- `campaignPerformanceInsight`
- `journeyDecisionCard`
- `contentDraftCard`
- `generatedCampaignImageCard`

### Metadata chain

For each Salesforce action output:

1. Return a typed Flow/Apex result.
2. Define a payload Custom Lightning Type for `outputValues`.
3. Define an MCP result-wrapper Custom Lightning Type with `actionName`, `isSuccess`, and `outputValues`.
4. Define a `UiWidgetBundle` with:
   - `{widgetName}.json` composition.
   - `{widgetName}.uiwidget-meta.xml` with `widgetType` set to `JSON`.
   - `schema.json` attribute contract.
5. Add root-level `renderer.json` to the result-wrapper CLT and map nested properties to widget attributes.
6. Add a resource to the custom MCP server definition using a URI such as `ui://widget/lightningType/c__campaignReadinessResult`.
7. Associate the resource with the MCP tool through `<uiResource>`.
8. Deploy the UiWidgetBundle before the LightningTypeBundle, or deploy them in one package manifest.

Use HXL output widgets for portable read results. HXL widget references do not currently support `editor.json`, so the proof uses the React confirmation/input UI for all structured input.

### Widget rules

- Show title, state, observation time, source, and primary evidence.
- Distinguish blockers, warnings, and recommendations.
- Never hide consent or approval status inside an accordion by default.
- Button actions emit an intent; the host re-authorizes and invokes the corresponding tool.
- Do not put credentials, raw prompts, customer PII, or unrestricted record JSON into widget attributes.
- Test in HXL Playground, the MCP Apps reference host, Agentforce, and the React host.

## 10. Orchestration and confirmation policy

### Request lifecycle

1. Authenticate principal and load workspace policy.
2. Classify intent and risk.
3. Ask only for missing material information.
4. Retrieve current evidence through read tools.
5. Delegate domain reasoning to the appropriate specialized agent.
6. Synthesize results with citations, confidence, and conflicts.
7. Render tiles.
8. For an allowed mutation, produce a preflight diff and request explicit confirmation.
9. On confirmation, re-check authorization and stale preconditions.
10. Execute with idempotency key.
11. Read back the authoritative system state.
12. Record outcome and show success, partial success, or failure without masking it.

### Risk classes

| Class | Examples | Default policy |
| --- | --- | --- |
| Read | Metrics, campaign summary, account signals | Auto-run within permissions |
| Draft | Brief, copy, audience proposal | Auto-run; clearly mark as draft |
| Write | Save a draft brief/campaign, create a review task, attach a selected image | Same-user explicit confirmation plus preflight |
| Publish | Publish content, activate a journey, or send | Not exposed in the proof |
| Destructive | Delete, suppress broadly, stop live program | Not exposed in the proof |

For the proof, the authenticated evaluator may confirm their own reversible sandbox write. Confirmation is a server-side object with a five-minute expiry, exact action and record scope, evaluator identity, request hash, and idempotency key. A browser button alone is not authorization.

## 11. Security, privacy, and governance

- Least-privilege Salesforce permission sets, business-unit access, object/field permissions, and sharing remain authoritative.
- Per-user Salesforce MCP OAuth ensures calls run in the authenticated user's context.
- Use only the supplied Salesforce sandbox and one isolated Cloudflare proof deployment; no production data or credentials are permitted.
- Apply data-classification tags to tools and tiles.
- Use only supplied sample data. Block contact details, raw audience members, and customer PII from orchestrator and image-model inputs.
- Keep consent decisions and send eligibility inside supported Salesforce/Data 360 paths.
- Enforce explicit Zod schemas and Worker-side field allowlists; optional Gateway DLP is deferred beyond the proof.
- Defend against prompt injection in CRM text, Salesforce content assets, image-generation source fields/reference metadata, and tool output. Retrieved content is data, never system instruction.
- Prohibit customer PII and audience-member data in image prompts; log a redacted prompt summary rather than unrestricted source text.
- Treat generated images as untrusted drafts. Require human review for brand, intellectual-property, safety, accessibility, and regional-policy concerns before attachment or publication.
- Sanitize links and iframe resources. Enforce CSP and origin checks in MCP Apps bridges.
- Rate-limit per user, workspace, tool, and upstream provider.
- Retain transcripts and audit events for 14 days, all R2 image objects for seven days, and no copied customer datasets. Store only Salesforce record references where possible.
- Provide an admin kill switch for each connector, agent, tool, and mutation class.

## 12. Observability and operations

### Telemetry

- End-to-end correlation ID.
- Agent/model version and prompt version.
- Tool discovery, selection, arguments hash, duration, outcome, and retry count.
- Upstream server and authoritative record references.
- Confirmation request, confirmation/denial, executor, and read-back result.
- Tile render mode: HXL/MCP Apps, native structured fallback, or error fallback.
- Token/cost and Flex Credit attribution by workspace and use case.
- Image model, prompt version/hash, dimensions, generation duration, R2 object key, selection/rejection outcome, and Workers AI cost attribution.
- Field-policy blocks, Access denials, OAuth failures, and expired portal credentials.

### Proof targets

- First text or progress event within five seconds for at least 90% of the scripted demo runs.
- All three demonstration workflows complete successfully in three consecutive runs.
- At least 90% correct tool selection on a fixed 20-prompt evaluation set.
- No duplicate write after retry and no write without a valid confirmation in negative tests.
- Every permitted sandbox write has audit, idempotency, and authoritative read-back evidence.

### Runbooks

- Salesforce OAuth reconnect and revoked-user handling.
- Cloudflare portal server status `Error` / `Sync Required`.
- Agentforce action schema drift.
- HXL widget failure and native fallback.
- Model provider outage and degraded read-only mode.
- Workers AI model deprecation/capacity failure and R2 draft-retention cleanup.
- Partial Salesforce/image-generation failure and safe retry.
- Emergency disable for a tool or connector.

## 13. Repository and deployment shape

### Agent-first operating model

The repository is an execution environment for coding agents. Agents own implementation, UI design iteration, Salesforce metadata, Cloudflare configuration, tests, documentation, deployment diagnostics, and evidence capture. Humans are not routine approvers or task routers.

The root `AGENTS.md` is the binding execution contract. `docs/agent-delivery-contract.md` defines work-unit structure, stable verification commands, gate ordering, evidence requirements, drift controls, and the narrow human-escalation boundary. Every implementation change must have a work unit under `docs/work-units/`, and architecture decisions made inside the approved proof envelope must be recorded under `docs/decisions/` without pausing for human approval.

Agent autonomy stops only for credentials/MFA/OAuth consent, irreversible or out-of-scope external actions, policy or legal changes, missing required platform capability after evidence-backed attempts, or the final Phase 5 evaluator checkpoint. Routine implementation and design choices stay with the agent and must use the simplest reversible option consistent with Section 17.

Quality is enforced through executable gates rather than prose review:

- One root `pnpm verify` command runs the complete local gate; `pnpm verify:fast` supports iteration.
- Cross-boundary types originate in `packages/contracts`; tool, tile, Salesforce, HXL, fixture, and UI schemas cannot drift independently.
- Fixed constants from Section 17 are checked in CI: model IDs, image dimensions, generation cap, retention, roles, region, browser matrix, and allowed write classes.
- Tool-catalog snapshots reject new mutation classes or unreviewed capabilities.
- Prompt and routing evaluations enforce the fixed threshold and cannot be weakened without a recorded decision.
- Material UI work requires agent-produced screenshot and accessibility evidence; humans see it only at the final proof review unless escalation criteria apply.
- External writes require deployment identifiers and authoritative read-back evidence in the work unit.
- A skipped or failing gate prevents completion; agents cannot convert it into a warning merely to proceed.

```text
AGENTS.md                     root execution and escalation contract
.github/
  pull_request_template.md    evidence and guardrail checklist
apps/
  web/                         React/Vite workbench
  edge/                        Worker + MarketingOrchestrator
packages/
  contracts/                   Zod schemas and shared types
  ui/                          native tile registry and design system
  mcp-apps-host/               AppBridge, iframe policy, fallback adapter
  evals/                       routing, safety, and synthesis evaluations
salesforce/
  force-app/main/default/
    aiAuthoringBundles/         Agent Script authoring bundles
    flows/
    classes/
    lightningTypes/
    uiWidgets/
    mcpServerDefinitions/
  specs/                       agent specs and test specs
infra/
  cloudflare/pot/              proof portal, Access, bindings, and setup record
docs/
  agent-delivery-contract.md   work loop, command contract, and drift controls
  architecture/
  decisions/                   short agent-authored architecture records
  demo/
  runbooks/
  work-units/                  scoped tasks with acceptance and evidence
artifacts/
  evidence/                    immutable, non-sensitive proof evidence by work unit
  reports/                     machine-readable gate reports
```

### CI/CD

Pull request gates:

- Work-unit schema, declared scope, acceptance checklist, and evidence links.
- Typecheck, lint, unit tests, contract tests, Worker runtime tests.
- Agent Script validation and metadata validation.
- Apex tests and Flow/action contract tests.
- HXL/CLT schema and mapping tests.
- Accessibility checks and Playwright journeys.
- Prompt/tool-routing evaluation thresholds.
- Secret scanning and dependency review.
- Section 17 invariant check, tool-catalog allowlist diff, generated-artifact freshness, and documentation link/terminology checks.

Promotion order:

1. Deploy Salesforce Apex/Flow dependencies.
2. Deploy UiWidgetBundles and LightningTypeBundles.
3. Deploy Agent Script bundles and tests; activate the approved version.
4. Deploy and activate custom Hosted MCP server definitions.
5. Sync/verify the Cloudflare portal capability catalog.
6. Deploy Worker and static assets to the isolated proof environment.
7. Run end-to-end smoke and mutation read-back tests.
8. Record the deployed versions, demo evidence, and teardown steps. There is no production promotion in this plan.

## 14. Test strategy

### Agentforce

- Agentforce DX test specs for utterance routing, variable gates, action selection, and refusal behavior.
- Sandbox smoke tests for the selected standard actions.
- Apex and Flow tests for success, empty, permission denied, validation, and partial data.
- Tests proving action chains stop before confirmation boundaries.
- Activated-agent tests because some CLT rendering does not work in draft preview.

### MCP

- Test Salesforce Hosted MCP directly with Postman before introducing the portal or model.
- Verify OAuth PKCE, tool list, schemas, resource discovery, and each tool with fixed JSON.
- Verify portal tool aliases and allowlists.
- Verify Streamable HTTP through the MCP server portal; do not configure an SSE-only upstream.
- Verify the Worker rejects disallowed fields before model or MCP dispatch.

### Image generation

- Mock the Workers AI binding for schema, timeout, malformed response, unsupported-size, and quota tests.
- Verify prompt compilation uses only allowlisted fields and blocks customer PII, embedded instructions, and all reference assets.
- Verify MIME type, dimensions, content hash, R2 draft key, retention metadata, and short-lived image authorization.
- Verify the configured model is exactly `@cf/black-forest-labs/flux-2-klein-4b` and output is 1024×1024.
- Verify retry creates a distinct variant and that an unapproved draft cannot be attached to Salesforce.
- Test selection, rejection, attachment confirmation, Salesforce asset mutation, and authoritative read-back end to end.

### UI and orchestration

- Contract fixtures for every tile and error.
- MCP Apps reference host tests plus React host tests.
- Reconnect during a stream, during a confirmation, and after an upstream write.
- Duplicate-click and duplicate-delivery tests with the same idempotency key.
- Cross-workspace isolation tests.
- Accessibility checks in current desktop Chrome and Edge.
- Prompt-injection fixtures embedded in Salesforce records and image-generation source fields.
- Evaluation set covering tool choice, Salesforce evidence synthesis, creative-prompt quality, uncertainty, citation correctness, and abstention.

## 15. Delivery plan

Assumption: agent execution capacity covering React/Cloudflare, Salesforce, design, testing, and documentation. Humans provide credentials or consent when required and perform the final proof review. Target duration is six weeks; this is a technical proof, not a production rollout.

### Phase 0 — Architecture and delivery planning (complete)

This document completes the planning stage: scope, architecture, system boundaries, source-of-truth rules, agent and tool portfolio, confirmation classes, delivery stages, test strategy, and acceptance criteria are defined. Section 17 records the chosen defaults; it is not a pending decision register.

Exit: plan accepted for implementation. Technical validation occurs in the pre-deployment gate of the stage that owns the capability.

### Phase 1 — Cloudflare and React foundation (1 week)

- Monorepo, agent execution contract, work-unit/evidence directories, stable root verification commands, CI gates, Worker Static Assets, Access, Durable Object migration, and health endpoints.
- Streaming chat with server-authoritative persistence/recovery.
- Workspace shell, source status, activity, tile envelope, and native tile registry.
- AI Gateway, Workers AI/R2 bindings, and baseline observability.

Pre-deployment gate:

- Complete the threat model and data-classification review for the Worker, browser, Durable Objects, D1, R2, model traffic, and MCP boundary.
- Prove a clean agent can follow `AGENTS.md`, execute a sample work unit, run every local gate from one command, and produce the required evidence without undocumented setup.
- Verify Access identity claims, proof-workspace isolation, secrets handling, migrations, rollback, and baseline telemetry in the proof environment.
- Pass reconnect, cross-workspace isolation, static-asset, and health-check tests.

Exit: the foundation passes its gate; an authenticated user can sustain a reconnect-safe conversation and see mock structured tiles.

### Phase 2 — Salesforce core (2 weeks)

Implementation status (updated 2026-09-21):

- [x] Instantiate, commit, activate, retrieve, and validate dedicated Northstar Campaign Creation, Content Builder, and Account Discovery agents from the Salesforce standard templates.
- [x] Build, activate, retrieve, and validate the custom Campaign Readiness and Governance Agent in Agent Script with a dedicated Einstein Agent User.
- [x] Deploy and test the focused Apex actions, idempotency fields, and evaluator permission set.
- [x] Directly verify the deployed net-new Northstar Hosted MCP server and External Client Application. The source-controlled 13-tool composition is active and read back; evaluator PKCE OAuth, initialize/initialized, exact 13-tool discovery, a readiness call, and rejection of an unconfirmed write all passed over direct Streamable HTTP.
- [x] Connect the Salesforce server through the Cloudflare MCP portal with per-user OAuth and verify recovery states. Evaluator Worker OAuth, recovery, exact 13-tool discovery, and the read path pass.
- [ ] Run the representative-record smoke suite and the one confirmed write/read-back proof. The confirmed write/read-back passes; only representative consent data remains absent.

Current representative-data read-back: the active default business unit and active default Data 360 data space are linked and contain representative CRM and identity data. The accessible core and Data 360 consent stores contain zero records, so the consent-data portion of this gate remains open; agents must not manufacture consent state because it is outside the three permitted proof writes.

Current Cloudflare read-back: the confirmation-audit migration is applied and Worker v19 is deployed with the portal URL and three secret bindings. The net-new upstream, portal, proxied CNAME, and both dedicated Access applications are live; `AWB` remains unchanged. Evaluator PKCE OAuth, initialize/initialized, server discovery, exact 13-tool synchronization, a live readiness call, Worker recovery states, and one explicit confirmed write all passed. Salesforce Task `00TjV000000uDyfUAE` read back against Campaign `701jV000004GglIQAS` with the same idempotency key recorded as executed in D1. The HMAC token retains Cloudflare's cached five-field tool schema while binding the five-minute expiry, principal, scope, request hash, and idempotency key. The two write tools remain unavailable to autonomous model execution.

All pre-existing org artifacts—including Fizi, Agent Two, existing MCP servers, and existing External Client Applications—are read-only and outside the Northstar proof. Phase 2 creates separately named Northstar artifacts and never repurposes or modifies an existing artifact without explicit permission.

- Smoke-test and configure the assumed standard marketing agents and actions.
- Build custom Campaign Readiness and Governance Agent in Agent Script.
- Build deterministic Flow/Apex actions and tests.
- Create custom Hosted MCP server with focused tools.
- Configure Cloudflare portal and per-user Salesforce OAuth.
- Integrate Campaign Creation, Content Builder, and Account Discovery.

Pre-deployment gate:

- Verify the evaluator permission set, one business unit, one data space, consent and identity behavior, the three selected standard agents, and representative CRM/marketing/Data 360 records. Licensing and edition analysis are explicitly skipped.
- Prove the custom Salesforce Hosted MCP server directly with fixed Postman requests before routing it through the Cloudflare portal or a model.
- Verify per-user OAuth, tool/resource discovery, least-privilege access, mutation confirmation, and authoritative read-back.

Exit: the Salesforce capability and deployment gate passes; read and draft workflows work end to end, and a confirmed save action reads back the Salesforce result.

### Phase 3 — HXL and portable cards (1 week)

- Build CLTs and the initial widget catalog.
- Implement the React MCP Apps host and sandbox policy.
- Add native fallbacks and accessibility checks.
- Test in HXL Playground, reference host, Agentforce, and workbench.

Pre-deployment gate:

- Confirm the target org's HXL/API version and required beta enablement.
- Prove each widget in HXL Playground and an MCP Apps-compatible reference host before enabling it in the workbench.
- Pass schema mapping, CSP/sandbox, accessibility, source-chrome, and native-fallback parity tests.

Exit: the HXL deployment gate passes; campaign readiness and at least two standard-agent results render as HXL-backed tiles with fallback parity.

### Phase 4 — Campaign image workflow (1 week)

- Implement the narrow `generate_campaign_image` tool using `@cf/black-forest-labs/flux-2-klein-4b`.
- Compile bounded prompts from approved campaign and brand fields, generate 1024×1024 output, enforce PII controls, and apply the 100-image/USD 25 cap.
- Store immutable draft variants in R2 with D1 lifecycle/audit metadata and retention cleanup.
- Render `generatedCampaignImageCard` with reject, revise, select, and explain controls.
- Implement the separately confirmed Salesforce asset-attachment action and authoritative read-back.
- Run creative-quality, basic brand-review, safety, failure, latency, and cost checks on the scripted demo corpus.

Pre-deployment gate:

- Prove a 1024×1024 generation through the target Workers AI binding and record the selected model's current contract, availability, pricing, and terms.
- Verify R2 capacity, encryption/access policy, lifecycle deletion, authorized delivery, and audit metadata in the target environment.
- Pass PII exclusion, prompt-injection, quota, timeout, malformed-output, human-review, and confirmed-attachment tests.

Exit: the image workflow deployment gate passes; one campaign prompt produces reviewable variants, and an explicitly confirmed selection is attached and read back without exposing customer data.

### Phase 5 — Integrated proof and evidence capture (1 week)

- Confirmation objects, preflight diffs, idempotency, and compact audit export.
- Negative permission, prompt-injection, duplicate-write, and cross-workspace tests.
- Demo script, evaluator guide, diagnostics page, kill switches, and teardown instructions.
- Run each scripted workflow three consecutive times with captured evidence: discover an account and draft a campaign brief; draft content and assess readiness/create a review task; generate, select, and attach a campaign image.

Pre-deployment gate:

- Pass permission, idempotency, recovery, audit-export, and selected failure-mode tests across the assembled system.
- Have one Salesforce owner and one marketing evaluator review the recorded proof results.
- Confirm diagnostics, tool kill switches, data-retention jobs, and teardown steps.

Exit: the proof targets pass, evidence is captured, limitations are documented, and the team can decide whether a separate production-discovery effort is warranted.

## 16. Acceptance criteria for the proof

- Authentication, tenant isolation, and Salesforce authorization are enforced server-side.
- The portal exposes only the approved tool catalog.
- Campaign Creation, Content Builder, Account Discovery, and the custom readiness agent pass their test suites.
- The custom agent is authored in Agent Script and deployed from source control.
- At least three Salesforce action outputs have CLT/HXL widgets; the React fallback produces equivalent information.
- Workers AI can generate a reviewable image variant, R2 retains it under policy, and only a confirmed selection can be attached to Salesforce with authoritative read-back.
- Users can cancel, reconnect, resume, and recover without duplicate turns.
- Every insight tile exposes source and freshness.
- Every mutation requires the configured confirmation and uses an idempotency key.
- Successful mutations are read back from the authoritative source.
- Prompt injection, permission-denied, expired OAuth, quota, and partial-failure paths have tested UI states.
- The diagnostics page, evaluator guide, retention cleanup, kill switches, and teardown procedure work.
- The three scripted workflows pass three consecutive runs and tool selection is at least 90% correct on the 20-prompt evaluation set.

## 17. Chosen proof defaults

1. **Salesforce:** one supplied sandbox on the current generally available production release, with every required Salesforce license and feature assumed present.
2. **Agents:** Campaign Creation, Content Builder, Account Discovery, and the custom Campaign Readiness and Governance Agent, all exposed from the new Agent Script Builder. No Journey Decisioning or preview agents.
3. **Cloudflare:** assume the account already permits Workers, Agents/Durable Objects, D1, R2, Workers AI, Access, AI Gateway, and MCP server portals. Use one proof Worker, one portal, one Durable Object namespace, one D1 database, and one R2 bucket. Optional Gateway DLP, Terraform, staging, and production environments are deferred.
4. **Identity:** Cloudflare Access email one-time PIN for an explicit evaluator allowlist; per-user Salesforce OAuth; `evaluator` and `demo-admin` roles only.
5. **Orchestrator model:** Cloudflare-hosted `@cf/openai/gpt-oss-20b` through AI Gateway, with sample sandbox data only and no customer PII in model inputs.
6. **Image generation:** `@cf/black-forest-labs/flux-2-klein-4b`, one 1024×1024 PNG per call, no reference images, one concurrent request per user, and a hard proof cap of 100 images or USD 25.
7. **Retention:** transcripts and audit events for 14 days; every R2 image object for seven days; Salesforce remains the only source of truth for campaign data and attached assets.
8. **Writes:** same-user confirmation permits only saving a draft brief/campaign, creating a review task, and attaching a selected generated image. Publish, send, activate, delete, suppress, buyer-group mutation, and arbitrary CRUD are unavailable.
9. **Evaluation slice:** the `Northstar Demo` business unit and fictional Northstar brand, United States, English only, supplied sample data, and current desktop Chrome and Edge.
10. **Success:** the three workflows—account discovery plus campaign brief, content draft plus readiness/review request, and image generation plus attachment—each pass three consecutive runs; tool selection reaches at least 90% on 20 prompts; negative tests produce no unauthorized or duplicate write; and every allowed write has confirmation, audit, idempotency, and read-back evidence.

## 18. Recommended first vertical slice

Deliver one narrow flow before expanding the tool catalog:

> “Review campaign X, explain its recent performance, identify readiness blockers, generate a campaign image, and create a review request after I approve.”

This slice exercises the complete architecture:

- React streaming chat and tiles.
- Cloudflare orchestrator and persistent state.
- MCP server portal and per-user OAuth.
- Salesforce Campaign Creation/insight actions.
- Custom Agent Script readiness agent.
- Data 360 consent-aware checks.
- Workers AI campaign-image generation and governed R2 draft storage.
- CLT/HXL campaign readiness card.
- Human approval, idempotent Flow mutation, audit, and authoritative read-back.

The vertical slice must produce artifacts that are useful outside the demo UI. A saved campaign brief must contain reviewable campaign content; a review request must be a populated Salesforce Task with campaign context, explicit readiness findings, ownership workflow details such as priority and due date, and an actionable human checklist; a selected image must be attached to the authoritative Campaign. IDs, hashes, generic labels, and empty records are evidence metadata, not acceptable primary deliverables.

It is a better proof than a broad read-only chatbot because it validates the difficult boundaries: identity, tool routing, portable UI, consent, generated-asset governance, approval, and recovery.

## 19. Primary references

- [Salesforce Marketing Cloud Next AI setup and standard agents](https://help.salesforce.com/s/articleView?id=sf.mktg_admin_setup_einstein.htm&language=en_US&type=5)
- [Salesforce Winter ’27 Marketing Cloud Next release notes](https://help.salesforce.com/s/articleView?id=release-notes.rn_marketing.htm&language=en_US)
- [Salesforce Agent Script](https://developer.salesforce.com/docs/ai/agentforce/guide/agent-script.html)
- [Salesforce Agent Script action reference](https://developer.salesforce.com/docs/ai/agentforce/guide/ascript-ref-actions.html)
- [Salesforce Hosted MCP Servers](https://developer.salesforce.com/docs/platform/hosted-mcp-servers/guide/hosted-mcp-servers-overview.html)
- [Exposing Agentforce agents as MCP tools](https://developer.salesforce.com/docs/platform/hosted-mcp-servers/guide/agentforce.html)
- [Salesforce Hosted MCP standard servers](https://developer.salesforce.com/docs/platform/hosted-mcp-servers/guide/servers-reference.html)
- [HXL widgets for Agentforce action output](https://developer.salesforce.com/docs/platform/hxl/guide/agentforce-action-output.html)
- [HXL widgets on MCP channels](https://developer.salesforce.com/docs/platform/hxl/guide/hxl-mcp-channels.html)
- [Cloudflare MCP server portals](https://developers.cloudflare.com/cloudflare-one/access-controls/ai-controls/mcp-portals/)
- [Cloudflare Agents SDK MCP client](https://developers.cloudflare.com/agents/model-context-protocol/apis/client-api/)
- [Cloudflare chat agents](https://developers.cloudflare.com/agents/communication-channels/chat/chat-agents/)
- [Cloudflare Workers AI model catalog](https://developers.cloudflare.com/workers-ai/models/)
- [gpt-oss-20b on Workers AI](https://developers.cloudflare.com/workers-ai/models/gpt-oss-20b/)
- [FLUX.2 klein 4B on Workers AI](https://developers.cloudflare.com/workers-ai/models/flux-2-klein-4b/)
- [FLUX.2 dev on Workers AI](https://developers.cloudflare.com/workers-ai/models/flux-2-dev/)
- [Workers AI bindings](https://developers.cloudflare.com/workers-ai/configuration/bindings/)
- [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- [MCP Apps specification and SDK](https://github.com/modelcontextprotocol/ext-apps)
