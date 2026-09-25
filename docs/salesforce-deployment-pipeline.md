# Salesforce deployment pipeline

The `Salesforce metadata` GitHub Actions workflow validates the governed Salesforce core on pull requests and deploys it after those changes merge to `main`. The automated core contains Apex classes, objects and fields, the evaluator permission set, and the Hosted MCP definition. The deployment runs `NorthstarCampaignActionsTest`, then retrieves the governed Hosted MCP definition as deployment read-back.

Configure the GitHub `proof` environment with these Actions secrets:

- `SF_SFDX_AUTH_URL`: an SFDX authorization URL for a dedicated integration user in the approved proof org. Generate it from an authorized local CLI session and rotate or revoke it through Salesforce connected-app OAuth usage when necessary.
- `SF_APPROVED_PROOF_ORG_ID`: the exact organization ID that the authenticated connection must report. Keeping the expected target in the protected environment prevents repository changes from silently authorizing another org.
- `BLOCKED_WORDS_LOCAL`: the newline-delimited local blocked-word list. Keep it only in the environment secret; never add its values to source control or workflow logs.

The workflow refuses to continue unless Salesforce reports the exact proof-org ID stored in the protected environment. Pull requests run a check-only deployment. Pushes to `main` and manual runs perform the deployment. The concurrency group serializes proof-org deployments rather than canceling an in-progress Salesforce operation.

HXL `UiWidgetBundle` and `LightningTypeBundle` metadata is intentionally excluded from this source-format job. The pinned Salesforce CLI cannot infer `UiWidgetBundle`; those components retain the explicit Metadata API package workflow documented in WU-005. Agent publication and activation also remain explicit Agentforce DX operations rather than implicit side effects of the core metadata job.

The SFDX URL is passed to `sf org login sfdx-url --sfdx-url-stdin`, so credential material is not written to a repository file. GitHub environment protection can require approval before either validation or deployment receives the secrets.
