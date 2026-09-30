# Demo and evaluator guide

Use this guide to walk a client (or a colleague) through the workbench. It assumes Salesforce is connected; in fixture mode the same steps run against fictional local data and skip the Connect section. `pnpm workbench:init` also writes `.workbench/demo-script.md`, a run-sheet tailored to the use cases you selected. Do not enter production data or customer PII.

## Connect and recover

1. Open the workbench (`http://127.0.0.1:5173` locally, or your deployed URL and its sign-in prompt).
2. In **Salesforce agents**, select **Connect**. Complete the portal and Salesforce authorization prompts as the evaluator user.
3. Return to the workbench. The connector must show **ready** and report the curated tool count. If authorization is still open, use **Resume authorization** or **Check status**.
4. Select **Disconnect**, confirm the connector returns to **disconnected**, then connect again. An expired grant must show **expired** with **Reconnect**; a permission failure must explain that evaluator permissions need correction.

## Read and draft test

1. Open **Quickstart** and choose a supported sample prompt, or ask: `Review the sample campaign and list its readiness blockers.`
2. Confirm the answer cites Salesforce-backed evidence and that no write confirmation appears.
3. Open a campaign from an insight card and verify Salesforce opens the sample record in a new tab.
4. Ask for a draft campaign brief. Confirm the result is marked as a draft and that no publish, send, activate, delete, suppress, buyer-group mutation, or arbitrary CRUD action is offered.

## Confirmed review-request test

1. Select **Create review request** on the readiness tile.
2. Review the campaign ID, summary, and five-minute expiry. Select **Cancel** once and verify that no task is created.
3. Start the request again and select **Confirm create** once.
4. Verify the success state shows the Task subject, priority, and due date, then use **Open task in Salesforce** to inspect the record.
5. Verify the Salesforce Task contains the campaign name, status, type, schedule, draft brief, explicit readiness findings, and the three-step human review checklist. An incomplete campaign must produce a high-priority Task that names the missing brief or dates; internal confirmation hashes must not appear in the Task description.
6. Verify the activity feed reports **Review request created** with a Salesforce read-back record ID.
7. Record the same idempotency key and source record ID from the D1 confirmation audit and Salesforce Task read-back. Retrying execution must not create a second Task.

## Current demo boundary

The in-app quickstart separates workflows available now from coming-soon work. Publishing, sending, activation, deletion, suppression, and arbitrary Salesforce edits are intentionally unavailable and must not be presented as planned demo actions.

## Expected blockers

- A Salesforce (or Cloudflare/AWS sign-in) login, MFA, or consent prompt requires a person.
- A sandbox with no representative consent records fails the smoke gate by design; do not manufacture consent data.
- If the connector cannot recover after authorization, capture the visible state and correlation ID without recording tokens, email addresses, or blocked local values.
