# ADR-008: Marketing Cloud Next agents create briefs, campaigns, and flows

Status: accepted

Date: 2026-09-27

## Context

Andrew Bauer asked the workbench to follow Marketing Cloud Next's own process: its out-of-the-box agents create the brief and the campaign, the records land as Marketing Cloud Next campaigns with flows, and tool calls show which Salesforce agents did the work.

Until now, confirmed saves ran custom Apex (`NorthstarSaveCampaign`, `NorthstarSaveBrief`, `NorthstarSaveMessage`, `NorthstarSaveCampaignBrief`) into custom objects (`Northstar_Brief__c`, `Northstar_Message__c`).

What the proof org and the documentation show:

- **Standard records.** The org has Marketing Cloud Next's `Brief` and `BriefPlanStep` objects, and `Campaign.BriefId` and `Campaign.Stage`.
- **Standard actions.** It has the managed `MktCloud__GenerateBrief`, `GenerateCampaignFromBrief`, `RefineCampaignPreview`, and `SaveCampaign` flows, and the `saveBrief` and `createCampaign` standard actions.
- **Our agent is already the right type.** `Northstar_Campaign_Creation` is an Agent Script agent from the `MktCloud__CampaignCreationAgent` template, published and active, whose script wires those actions in Salesforce's required order.
- **Only Agent Script agents can be MCP tools.** Salesforce's Hosted MCP documentation allows only Agent Script agents to be exposed as MCP tools, so the legacy-built agent in the org can't be called by the workbench (and Andrew asked not to use it).
- **Live preview confirmed the path.** Sessions with `Northstar_Campaign_Creation` (`sf agent preview`, live actions) created a Brief with two email `BriefPlanStep`s, then a Campaign linked to the brief and its draft `Journey` flow.
- **One message per call works.** A fresh session given a confirmed brief saved it and drafted its preview. A fresh session given a confirmed brief id created and saved the campaign.

## Decision

- **Briefs and campaigns come from the agent.** They are created only by the Campaign Creation agent's standard actions, never by workbench Apex. The custom save actions, `NorthstarRecordWrites`, the custom objects, and the Campaign brand field are removed.
- **Two confirmed writes, each one agent request.** Each goes through `ag:Northstar_Campaign_Creation`:
  - `save_marketing_brief` asks the agent to run Save Campaign Brief, then Draft a Campaign Preview.
  - `create_marketing_campaign` asks it to run Create Campaign, then Save Campaign.

  The server authors each request from the confirmed draft, and it puts the text in whatever string parameter the tool's schema declares.
- **Drafting and refining go through the agent too.** `draft_campaign_brief` (Draft a Campaign Brief) ends campaign requests, including the Coastline plan. Its reply becomes the focus, field for field. Revising an unsaved brief re-drafts it through the agent; changing a saved one runs `refine_campaign_preview` (Refine Campaign Preview).
- **Authoritative read-back.** `get_marketing_records` is a read-only Apex action that returns the Brief, its steps, the Campaign, and the flow. The workbench shows a write as done only when this read-back matches; the agent's reply is never proof.
- **Governance.** The confirmation card, permission check (`check_write_access`, with new actions), request hash, expiry, and audit stay the same. The HMAC-signed Apex verification now applies only to the review-task and image writes, because the standard actions can't verify a workbench signature. For briefs and campaigns, the safeguards are:
  - only the confirmation flow can call the agent's write tools
  - the agent runs as the user, so Salesforce enforces their permissions
  - the read-back verifies the result
- **Visibility.** `SALESFORCE_TOOL_DETAILS` lists each tool's agent, subagent, and actions. The chat's **Salesforce agents** panel, the technical trace, the confirmation card, and the success banner all show them.
- **Not activated.** The campaign flow is created as a draft; the audience, sender, and activation stay in Marketing Cloud.

## Consequences

- Records created by the workbench are ordinary Marketing Cloud Next briefs and campaigns, editable and activatable in the Marketing app.
- The standard actions aren't idempotent. The confirmation is spent before the agent is called, and a failure asks the user to check Marketing Cloud before retrying.
- The preview's channels are the ones the agent plans: email in this org. A push request is recorded in the brief's guardrails.
- The D1 audit accepts the new action names (migration 0004) and keeps the retired ones for old rows.
- After the MCP definition is deployed, the retired Apex classes and custom objects are deleted from the proof org.

## Supersedes

The custom record-write design from WU-037: Apex saves into `Northstar_Brief__c` and `Northstar_Message__c`, and campaigns created by Apex.
