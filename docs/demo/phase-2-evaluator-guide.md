# Phase 2 evaluator guide

Use this guide to test the deployed Salesforce core with the fictional Northstar sample data. Do not enter production data or customer PII.

## Connect and recover

1. Open the demo Worker URL and complete the Cloudflare Access email one-time-PIN prompt.
2. In **Salesforce agents**, select **Connect**. Complete the portal and Salesforce authorization prompts as the evaluator user.
3. Return to the workbench. The connector must show **ready** and report the curated tool count. If authorization is still open, use **Resume authorization** or **Check status**.
4. Select **Disconnect**, confirm the connector returns to **disconnected**, then connect again. An expired grant must show **expired** with **Reconnect**; a permission failure must explain that evaluator permissions need correction.

## Read and draft test

1. Open **Quickstart** and choose a supported sample prompt, or ask: `Review the Northstar sample campaign and list its readiness blockers.`
2. Confirm the answer cites Salesforce-backed evidence and that no write confirmation appears.
3. Open a campaign from an insight card and verify Salesforce opens the sample record in a new tab.
4. Ask for a draft campaign brief. Confirm the result is marked as a draft and that no publish, send, activate, delete, suppress, buyer-group mutation, or arbitrary CRUD action is offered.

## Confirmed review-request test

1. Select **Create review request** on the readiness tile.
2. Review the campaign ID, summary, and five-minute expiry. Select **Cancel** once and verify that no task is created.
3. Start the request again and select **Confirm create** once.
4. Verify the success state reports that the review task was created and verified, then use **Open task in Salesforce** to inspect the record.
5. Verify the activity feed reports **Review request created** with a Salesforce read-back record ID.
6. Record the same idempotency key and source record ID from the D1 confirmation audit and Salesforce Task read-back. Retrying execution must not create a second Task.

## Current demo boundary

The in-app quickstart separates workflows available now from coming-soon work. Publishing, sending, activation, deletion, suppression, and arbitrary Salesforce edits are intentionally unavailable and must not be presented as planned demo actions.

## Expected blockers

- A Cloudflare or Salesforce login, MFA, or consent prompt requires the evaluator.
- The supplied proof org currently has no representative consent records. The smoke gate must continue to fail that assumption; do not manufacture consent data.
- If the connector cannot recover after authorization, capture the visible state and correlation ID without recording tokens, email addresses, or blocked local values.
