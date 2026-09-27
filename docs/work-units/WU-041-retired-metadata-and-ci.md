---
id: WU-041
title: Retire custom write metadata from the org, and make CI run every gate
status: active
plan_sections: [15, 17]
owners: [agent]
issue: 58
---

# Why

- **#58.** WU-040 removed the custom save Apex and objects from source, but CI only adds metadata, so they were still in the proof org.
- **#62.** No workflow ran `pnpm verify` or the E2E suite. The Salesforce workflow logged "Running Tests - Skipped", so the Apex tests never ran in CI.

## Changes

- **Retired metadata deleted from the proof org:**
  - Apex classes: `NorthstarSaveCampaign`, `NorthstarSaveBrief`, `NorthstarSaveMessage`, `NorthstarSaveCampaignBrief`, `NorthstarRecordWrites`, `NorthstarRecordActionsTest`
  - Objects: `Northstar_Brief__c` (0 records) and `Northstar_Message__c` (2 demo records)
  - Fields: `Campaign.Northstar_Brand__c`, and `Campaign.Northstar_Idempotency_Key__c`, which only the retired saves used. It's also removed from source and the permission set.
- **`salesforce/manifest/retired/`:** the destructive manifest.
- **`pnpm sf:retired:check`:** fails if any retired component exists in the org. It runs in the Salesforce workflow on every pull request and push.
- **Apex tests in CI:** they now run explicitly after each deployment, and the step fails unless they ran and all passed.
- **`Verify` workflow:** runs `pnpm verify` and the Playwright suite (Chrome and Edge projects) on every pull request and push to `main`.
- **Learn gate fix:** it ignored every `-meta.xml` file, so changes to Salesforce objects, fields, permission sets, and the MCP definition never counted as drift. It now ignores only Apex class companions and tests.

## Verification

```text
pnpm verify
SF_TARGET_ORG=northstar-pot pnpm sf:retired:check
```

## External mutations

- **Proof org:** a Metadata API deploy of the retired manifest with the permission set deleted the 10 components listed above. Read-back found none left: 0 retired Apex classes, 0 objects, and no `Northstar*` Campaign fields.

## Evidence

- `pnpm sf:retired:check` passes against `northstar-pot`: none of 10 retired components exist.
- The first CI runs of the new steps are recorded on the pull request.
