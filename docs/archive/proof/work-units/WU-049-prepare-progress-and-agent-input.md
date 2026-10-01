---
id: WU-049
title: Show a confirmation's preparation live; fix the agent tool input crash
status: complete
plan_sections: [9, 15]
owners: [agent]
---

# Why

Andrew Bauer reported two problems:

- **Campaign create failed** with "Cannot read properties of undefined (reading 'slice')".
- **Accepting an action card showed nothing.** The review step prepares a confirmation, including Salesforce's permission check, and the UI didn't change until it finished.

## Changes

- **Agent tool input.** The Agents SDK's `getAITools()` gives each tool's input as a Zod schema, and a Zod object's `.required` is a method.
  - Before this fix, the code read that method as a list of required fields. That caused the earlier "required.find is not a function" crash, and the diagnostic log from its fix called `.slice` on `JSON.stringify(function)`, which is `undefined`.
  - `agentToolInput` now converts a Zod schema with `z.toJSONSchema`. It still accepts the AI SDK's `{ jsonSchema }` wrapper (a promise or a plain value) and plain JSON Schema, and it logs only parameter names.
- **Prepare progress.** `writeProgress` now has a `phase` field (`prepare` or `execute`), and `confirmationId` is optional.
  - `prepareConfirmation` publishes three steps: the plan, Salesforce's permission check (with how many checks passed), and binding the request to a one-time confirmation.
  - A failure marks the step where it stopped.
- **UI:**
  - Accepting an action card disables the cards and switches the button to *Preparing…*. The live steps show until the confirmation card replaces them.
  - The image attachment button does the same.

## Acceptance criteria

- A campaign create reaches the Campaign Creation agent: no crash reading the tool schema.
- After an action card is accepted, the UI shows the preparation right away and updates as it progresses.

## Verification

```text
pnpm verify
pnpm test:e2e
```

## External mutations

- A live `sf agent preview` session with the Northstar_Campaign_Creation authoring bundle ran the same request production sends. It created Campaign `701jV00000CHbVhQAL` on Brief `21yjV0000002QT3QAM` ("Coastline Kitchen Cloudy Lunch Campaign"). This shows the agent works and the failure was in the Worker. A retry in the workbench links that campaign instead of creating another.

## Evidence

- A unit test covers a real `z.fromJSONSchema` schema, the shape `getAITools()` returns.
- A Worker test checks a local review request's prepare steps (plan, permissions, confirm all done) and its execute steps.
- The E2E test holds the accept request, checks that *Preparing…* is disabled and that the preparing panel is visible and in view, then checks that the confirmation card replaces it (`artifacts/evidence/WU-049/`).
