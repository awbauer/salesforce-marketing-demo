# Salesforce deployment pipeline

The `Salesforce metadata` GitHub Actions workflow is **manual** (a fresh clone has no sandbox): run it from the Actions tab with `mode: dry-run` (validate only, the default) or `mode: deploy`. The automated core contains Apex classes, objects and fields, the evaluator permission set, and the Hosted MCP definition. A sandbox may skip `RunSpecifiedTests` during deployments (the log says "Running Tests - Skipped"), so after each deployment the workflow runs `WorkbenchCampaignActionsTest` and `WorkbenchMarketingAgentTest` explicitly and fails unless they ran and all passed. It then retrieves the governed Hosted MCP definition as deployment read-back. Pull requests validate the metadata but can't run the new Apex tests against undeployed code in this org; run them from a branch with `sf apex run test` after deploying the classes, as WU-040 did.

Configure the GitHub `salesforce` environment with these Actions secrets:

- `SF_SFDX_AUTH_URL`: an SFDX authorization URL for a dedicated integration user in the approved sandbox. Generate it from an authorized local CLI session and rotate or revoke it through Salesforce connected-app OAuth usage when necessary.
- `SF_APPROVED_ORG_ID`: the exact organization ID that the authenticated connection must report. Keeping the expected target in the protected environment prevents repository changes from silently authorizing another org.
- `BLOCKED_WORDS_LOCAL`: the newline-delimited local blocked-word list. Keep it only in the environment secret; never add its values to source control or workflow logs.

The workflow refuses to continue unless Salesforce reports the exact org ID stored in the protected environment. A dry run is a check-only deployment; `deploy` performs it. The concurrency group serializes deployments rather than canceling an in-progress Salesforce operation.

HXL `UiWidgetBundle` and `LightningTypeBundle` metadata is intentionally excluded from this source-format job. The pinned Salesforce CLI cannot infer `UiWidgetBundle`; those components retain the explicit Metadata API package workflow documented in WU-005. Agent publication and activation also remain explicit Agentforce DX operations rather than implicit side effects of the core metadata job.

The SFDX URL is passed to `sf org login sfdx-url --sfdx-url-stdin`, so credential material is not written to a repository file. GitHub environment protection can require approval before either validation or deployment receives the secrets.

## Retiring metadata

The core job only adds and updates metadata; removing a component from source doesn't delete it from the org. To retire a component:

1. Remove it from source and from `MarketingWorkbench` (the Hosted MCP definition), and merge so the new definition is live. The org won't delete an Apex class that a deployed MCP tool still references.
2. Add it to `salesforce/manifest/retired/destructiveChangesPost.xml`.
3. Delete it from the sandbox with a Metadata API deploy of that folder. The pinned CLI can't resolve source-format manifests in this project because of the HXL widget, so copy `package.xml`, `destructiveChangesPost.xml`, and the permission set (as `permissionsets/<name>.permissionset`) into a temporary folder, then run `sf project deploy start --metadata-dir <folder> --target-org <sandbox-alias>`.
4. Read it back with `SF_TARGET_ORG=<sandbox-alias> pnpm sf:retired:check`.

The workflow runs `pnpm sf:retired:check` on every run, so a retired component that reappears in the org fails CI. WU-040 retired the custom brief and message saves, `WorkbenchRecordWrites`, `Workbench_Brief__c`, `Workbench_Message__c`, and the two Campaign fields they used (ADR-008).
