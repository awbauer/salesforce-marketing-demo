---
id: WU-013
title: Route campaign summaries to a functional Salesforce reader
status: active
plan_sections: [3, 10, 16, 17]
owners: [agent]
---

# Objective

Make sample campaign summaries use bounded CRM evidence without depending on Marketing Cloud business-unit discovery, and make content drafting select the exact governed tool.

# Scope

- In-scope paths: Hosted MCP summary binding, deterministic content-draft routing, tests, Salesforce metadata deployment, and production read-back.
- Explicitly out of scope: production data, broad CRUD, bypassing Salesforce permissions, publishing or sending content, and adding writes.

# Acceptance criteria

- [x] `summarize_campaign` is backed by the governed readiness agent and its bounded `NorthstarGetCampaignContext` Apex action.
- [x] Campaign summary no longer enters the Campaign Creation agent's unconditional business-unit discovery path.
- [x] The exact sample content-draft prompt selects `draft_campaign_content` deterministically.
- [x] Empty assistant records do not render invented tool-free traces.
- [x] Malformed provider tool names are not echoed into the UI.
- [x] Embedded bearer and JWT-shaped values are redacted from technical payloads.
- [ ] Salesforce metadata deployment and Hosted MCP catalog read-back confirm the new summary binding.
- [ ] Browserless production diagnostics complete after the merged Worker deployment.

# Verification

```text
pnpm sf:metadata:check
pnpm verify
sf project deploy start --source-dir salesforce/force-app/main/default/mcpServerDefinitions/NorthstarMarketingWorkbench.mcpServerDefinition-meta.xml --target-org northstar-pot --wait 20
```

# External mutations

Update only the source-controlled `NorthstarMarketingWorkbench` Hosted MCP definition in the approved proof org. No records are created or changed.

# Evidence

- Live sanitized payload on 2026-09-25 proved `summarize_campaign` entered `Northstar_Campaign_Creation`, whose `before_reasoning` unconditionally invokes `IdentifyBusinessUnit`, then returned zero business units and no campaign result.
- Live trace on 2026-09-25 showed the model emitted a malformed content-draft tool name; deterministic routing removes model control over that tool identifier.
- Adversarial QA added direct web tests for empty assistant records, malformed tool identifiers, and embedded credential redaction. `pnpm verify` passed all 12 gates with 21 unit tests and 14 Worker tests; all eight Chrome/Edge journeys passed.
- Salesforce check-only deployment `0AfjV000002nZ3XSAU` validated the single changed `NorthstarMarketingWorkbench` MCP definition successfully with no component failures and no org mutation.

# Completion

- Final status: active pending delivery, Salesforce deployment, and production read-back.
- Commit: pending.
- Summary: pending.
