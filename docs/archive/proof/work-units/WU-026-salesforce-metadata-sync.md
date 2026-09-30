---
id: WU-026
title: Salesforce metadata sync outside CI
status: complete
plan_sections: [15, 17]
owners: [agent]
---

# Objective

Bring every Northstar metadata component that the Salesforce CI job does not deploy into verified parity with source in the approved proof org (`northstar-pot`, ADR-003).

## Scope

- **Covered by CI** (already deployed on `main` at `ba34f40`): Apex classes (including `NorthstarAttachCampaignImage`), objects and fields, the evaluator permission set, and the Hosted MCP definition.
- **Outside CI** and checked here: agent authoring bundles, bots, the HXL `UiWidgetBundle`, and the `LightningTypeBundle`.

## Result

- **Target:** the target was checked read-only before any change: instance host `pu1788182184076` (the origin committed in the UI), API 67.0, a non-sandbox Enterprise Edition org as ADR-003 describes. The org ID was not committed.
- **Already in sync:**
  - the 4 agent bundles: identical apart from whitespace
  - the 8 bot and bot version files: identical apart from element order
  - the Lightning type: identical
  - The agents were not republished.
- **Redeployed:** the `UiWidgetBundle` cannot be retrieved with the installed CLI (the same limitation WU-005 recorded), so the HXL package was redeployed from source with the committed manifest:
  - check-only validation `0AfjV000002oNY9SAM`: succeeded, 2 of 2 components
  - deployment `0AfjV000002oNebSAE`: succeeded, 2 of 2 components, 0 errors
- **Read-back:** both components show the new modification timestamps, and the Lightning type content is semantically identical to source.

Evidence: `artifacts/reports/WU-026/salesforce-metadata-sync.json`.

## External mutations and rollback

- One redeploy of two existing HXL components with unchanged content. No records, agents, or other metadata changed.
- Rollback: not needed. The content is identical to the previous deployment from WU-005.
