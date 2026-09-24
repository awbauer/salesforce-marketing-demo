---
id: WU-004
title: Enforce the local blocked-word delivery gate
status: complete
plan_sections: [11, 13]
owners: [agent]
---

# Objective

Prevent a locally configured list of sensitive or forbidden literal values from entering repository content, outgoing commits, pushes, or pull requests without ever committing the list itself.

## Scope

- In-scope paths: `AGENTS.md`, `.gitignore`, `.githooks/`, `scripts/`, root package scripts, delivery documentation, and this work unit.
- Explicitly out of scope: retroactively rewriting Git history, storing blocked values in CI, or exposing blocked values in logs and reports.
- Prerequisite: every delivery checkout maintains a non-empty `.config/blocked-words.local` file with one literal value per line.

## Contracts affected

- Delivery contract: `pnpm security:blocked-words` is mandatory before creating a pull request or pushing to any remote.
- Local Git contract: the tracked pre-push hook invokes the same fail-closed gate; `prepare` installs the repository hook path.
- Confidentiality contract: the local list is ignored, must not be tracked, and matching output identifies only files and match counts without printing values.

## Acceptance criteria

- [x] A missing, empty, unignored, or tracked local blocked-word list fails closed.
- [x] The gate scans repository worktree content, the index, and commits not present on `origin`.
- [x] A tracked pre-push hook blocks delivery on any match.
- [x] Agent instructions require a passing gate immediately before PR creation and push.
- [x] Local configuration and matching values never appear in committed artifacts or gate output.

## Verification

```text
pnpm security:blocked-words
pnpm verify:fast
pnpm verify
git diff --check
```

## External mutations

None. The hook installer changes only the checkout-local `core.hooksPath` Git setting.

## Evidence

- `pnpm security:blocked-words` passed with one checkout-local value and no matches; `git check-ignore` confirmed the list is excluded by the repository ignore rule.
- `pnpm verify:fast` passed all seven gates. The unrestricted `pnpm verify` passed all 11 gates, including 14 unit tests and 10 Worker tests.
- Unit tests prove missing and empty configuration failures, worktree detection, outgoing local-commit detection, and non-disclosure of configured values. Each sensitive test value is generated at runtime in a temporary repository and is neither committed nor printed.
- `core.hooksPath` reads back as `.githooks`, and direct pre-push-hook execution invokes the same gate.

## Completion

- Final status: complete
- Summary: local-only blocked values now fail closed before PR creation and at the tracked pre-push boundary.
