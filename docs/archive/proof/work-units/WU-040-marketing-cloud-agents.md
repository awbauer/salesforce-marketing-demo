---
id: WU-040
title: Marketing Cloud Next agents create briefs, campaigns, and flows
status: active
plan_sections: [9, 15, 17]
owners: [agent]
---

# Why

Andrew Bauer asked the workbench to follow Marketing Cloud Next Advanced's own process:

- use Salesforce's out-of-the-box agents to create the brief and the campaign
- land the records as Marketing Cloud Next campaigns with flows
- show more about the Salesforce agents behind each tool call

The workbench was saving briefs and messages through its own Apex into custom objects. See ADR-008.

## Changes

- **Agent-driven writes.**
  - `save_marketing_brief` and `create_marketing_campaign` are Hosted MCP tools on `ag:Northstar_Campaign_Creation`. That agent is a Marketing Cloud Next Campaign Creation agent (`MktCloud__CampaignCreationAgent`), published and active.
  - After the user confirms, the server sends the agent one request:
    - **Save brief:** the agent runs Save Campaign Brief, then Draft a Campaign Preview (creates Brief and BriefPlanStep).
    - **Create campaign:** the agent runs Create Campaign, then Save Campaign (creates the Campaign and its draft flow).
  - `get_marketing_records` (read-only Apex) reads the records back, and only the read-back updates the workspace.
- **Agent drafting.**
  - The Coastline plan, and "create a campaign in Salesforce/Marketing Cloud", end with `draft_campaign_brief`. The agent's brief becomes the focus.
  - Revisions go back to the agent: a re-draft before saving, `refine_campaign_preview` after. The preview then reloads from Salesforce.
- **Removed:**
  - `save_campaign`, `save_brief`, `save_message`, and `save_campaign_brief`
  - their Apex classes and `NorthstarRecordWrites`
  - `Northstar_Brief__c`, `Northstar_Message__c`, and `Campaign.Northstar_Brand__c`
  - their permission-set entries
- **Permission check.** `check_write_access` knows `save-marketing-brief` (Brief, BriefPlanStep) and `create-marketing-campaign` (Campaign, Marketing User, edit access on the brief).
- **Agent details everywhere.** `SALESFORCE_AGENTS` and `SALESFORCE_TOOL_DETAILS` in contracts drive:
  - a **Salesforce agents** panel under each answer: agent, type, template, subagent, actions and targets, and records created
  - the technical trace's tool rows
  - the confirmation card's "Marketing Cloud agent that does the work"
  - the success banner
- **Workspace.** The focus lifecycle is:
  - Draft in progress
  - Brief saved in Marketing Cloud, with the campaign preview steps
  - Campaign created in Marketing Cloud, with Campaign and flow links

  Records list Brief, Campaign, and Campaign flow.
- **Audit.** Migration 0004 accepts the new actions and keeps the retired ones for old rows.
- **Learn.**
  - New lesson: *Marketing Cloud Next: agent-built briefs, campaigns, and flows*, with a diagram.
  - Salesforce, governance, workspace, routing, orchestrator, UI, and observability sections are updated.
  - Reference entries are updated.
- **Gates.** The metadata check requires the brief and campaign tools to be bound to the Campaign Creation agent, and that agent to wire the standard actions. It also refuses retired custom writes.

## Acceptance criteria

- [x] Briefs and campaigns are created only by the Campaign Creation agent's standard actions.
- [x] Records are Marketing Cloud Next Brief, BriefPlanStep, Campaign (BriefId), and campaign flow.
- [x] Tool calls, confirmations, and results show the agent, subagent, and actions.
- [x] Saves are confirmed, permission-checked, and verified by read-back.
- [ ] Deployed: MCP definition, D1 migration 0004, and Worker; retired Apex and objects deleted from the org.

## Verification

```text
pnpm verify
pnpm test:e2e
sf apex run test --class-names NorthstarMarketingAgentTest --class-names NorthstarCampaignActionsTest
sf agent preview (authoring bundle, live actions): draft, save brief, create campaign
```

## External mutations

- **Salesforce proof org:**
  - Live agent preview sessions created demo briefs and campaigns: Rainy Day Comfort Campaign `701jV00000C75VVQAZ` with its flow, Late Night Baja Tacos `701jV00000C76xpQAB`, and the "Coastline Rainy Lunch Push" brief.
  - Deployed `NorthstarCheckWriteAccess`, `NorthstarGetMarketingRecords`, the two Apex test classes, and the permission set, so the Apex tests could run.
  - The MCP definition is not yet deployed; it deploys through CI on merge.
- **Cloudflare:** none yet.

## Evidence

- **Live agent sessions** (`Northstar_Campaign_Creation`, live actions):
  - The draft → save → create sequence created Brief `21yjV0000002NIHQA2` with two email `BriefPlanStep`s, then Campaign `701jV00000C75VVQAZ` (In Planning, `BriefId` set) and flow "Rainy Day Comfort Campaign Flow" (`Journey`, draft).
  - Fresh one-message sessions saved a confirmed brief and drafted its preview, and created a campaign from a confirmed brief id. Asked for the Brief ID, the agent includes it in its reply.
- **Read-back:** `NorthstarGetMarketingRecords` against Brief `21yjV0000002NIHQA2` returns the brief, both steps, the campaign, and the flow.
- **Apex tests:** 13 of 13 pass. `WITH USER_MODE` on Brief is unsupported in the Apex test context, so the read-back checks object access and strips unreadable fields instead.
- **Workbench tests:** unit, worker, and E2E pass, including local save brief → create campaign.
- **Screenshots:** `artifacts/evidence/WU-040/confirm-brief-*.png` and `campaign-created-*.png`.
- **Known limitations:**
  - The Hosted MCP tool's input parameter name for agent tools is read from its schema at run time. I couldn't list the live tools without the user's Salesforce OAuth session, so the production MCP call is not yet verified end to end.
  - In this org, the agent plans email steps even for push requests.
  - Insights, summaries, and readiness still use the custom readiness agent.
