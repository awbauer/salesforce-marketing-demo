# Salesforce deployment pipeline

The `Salesforce metadata` GitHub Actions workflow validates Salesforce source changes on pull requests and deploys the complete source-controlled `salesforce/force-app` package after those changes merge to `main`. It then retrieves the governed Hosted MCP definition as deployment read-back.

Configure the GitHub `proof` environment with these Actions secrets:

- `SF_SFDX_AUTH_URL`: an SFDX authorization URL for a dedicated integration user in the approved proof org. Generate it from an authorized local CLI session and rotate or revoke it through Salesforce connected-app OAuth usage when necessary.
- `BLOCKED_WORDS_LOCAL`: the newline-delimited local blocked-word list. Keep it only in the environment secret; never add its values to source control or workflow logs.

The workflow refuses to continue unless Salesforce reports the exact approved proof-org ID `00DjV000001wjXLUAY`. Pull requests run a check-only deployment. Pushes to `main` and manual runs perform the deployment. The concurrency group serializes proof-org deployments rather than canceling an in-progress Salesforce operation.

The SFDX URL is passed to `sf org login sfdx-url --sfdx-url-stdin`, so credential material is not written to a repository file. GitHub environment protection can require approval before either validation or deployment receives the secrets.
