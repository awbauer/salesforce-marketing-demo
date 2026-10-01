# Getting started for agents

Use this checklist when taking over a workbench instance. Establish the real state first, then continue the active work unit.

## 1. Establish authority and scope

Read, in order:

1. [`AGENTS.md`](../AGENTS.md).
2. [`architecture.md`](architecture.md): risk classes, confirmation policy, data rules.
3. `workbench.profile.json` (or [`profiles/example.profile.json`](../profiles/example.profile.json) on a fresh clone): the client, industry, use cases, models and deploy target this instance was set up for.
4. The active work unit in [`work-units/`](work-units/) and any decision in [`decisions/`](decisions/).
5. The contracts and tests in the paths the work unit names.

Do not substitute chat history or an old report for these. Unchecked acceptance criteria and stated limitations are unfinished work.

## 2. Inspect the checkout

```sh
git status --short --branch
git log --oneline --decorate -8
```

Preserve unrelated changes. Feature work belongs on a dedicated branch and pull request; the instance owner merges.

## 3. Prepare the environment

Baseline is Node 26 and pnpm 11.

```sh
pnpm install --frozen-lockfile
pnpm workbench:init        # first time only: writes workbench.profile.json and instance data
pnpm verify:fast
```

`.config/blocked-words.local` holds one literal value per line that must never reach Git (for example the real name of the client you are demoing for). It is ignored and never committed; `workbench:init` offers to create it. Run `pnpm security:blocked-words` before opening a PR and before every push; a missing or empty list fails closed. Use `pnpm verify` before committing a coherent work unit. If a sandbox reports `listen EPERM` for Miniflare, rerun with permission to bind a loopback port rather than skipping the test.

## 4. Reconstruct external state from read-back

External systems are optional. When the profile enables them:

- **Salesforce:** pass the org alias from the profile to every `sf` command, and set `SF_APPROVED_ORG_ID` so `pnpm sf:validate` fails closed unless the target is a sandbox or that exact org. Treat any artifact that predates this instance as read-only. A human completes login, MFA and OAuth consent.
- **Cloudflare / AWS:** follow `templates/cloudflare/README.md` or `templates/aws/README.md`. Deploys are dry-run by default and need explicit owner approval.
- Keep tokens and generated credentials out of Git, logs, reports, screenshots and prompts.

## 5. Deliver the next complete vertical change

Choose the first unchecked acceptance criterion that is not waiting on a human. Identify the source contract, failure states, narrow tests, live read-back, evidence and rollback target before editing. Make the smallest complete change; never lower a threshold, relax a permission, widen a tool surface, or swap a live gate for a fixture to pass.

## 6. Finish the loop

1. Run narrow checks, then `pnpm verify`.
2. Inspect `git diff --check`, the complete diff and `git status`.
3. Scan for secrets, unsupported claims, stale identifiers and unintended external changes.
4. Update the work unit, reports and rollback notes with demonstrated results only.
5. Run `pnpm security:blocked-words`; stop on any match or missing configuration.
6. Commit one coherent change, push the branch, open or update its PR, and never bypass the pre-push hook.
7. Read back the PR head, body and checks, and any deployed state.
8. State the one precise human action still required, if any.

The completion report format in `AGENTS.md` is mandatory.
