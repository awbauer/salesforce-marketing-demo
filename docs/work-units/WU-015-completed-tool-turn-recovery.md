---
id: WU-015
title: Preserve completed tool turns after stream interruption
status: active
plan_sections: [10, 13, 16, 17]
owners: [agent]
---

# Objective

Do not report a turn as interrupted when the current turn already contains a completed Salesforce tool result, even if a later empty assistant stream reports an error.

# Scope

- Current-turn chat error classification and regression coverage.
- No Salesforce writes, schema changes, or changes to durable conversation retention.

# Acceptance criteria

- [x] A completed assistant answer suppresses the interruption banner.
- [x] A completed tool output suppresses the interruption banner when followed by an empty assistant message.
- [x] A genuinely empty errored turn still shows the interruption banner.
- [x] A transient hook error cannot render while the turn is submitted, streaming, or recovering.
- [x] Tool completion appends a response event instead of rewriting the call event in place.
- [ ] Production browserless reproduction passes after delivery.

# Evidence

- The supplied production payload contains `isError: false`, structured campaign-brief output, and a saved Brief record before the contradictory interruption banner.
- Unit coverage models the exact user, successful tool output, empty assistant sequence.
- `pnpm verify` passed all 12 gates with 22 unit tests, 15 Worker tests, 20/20 routing evaluations, metadata and HXL contracts, typechecking, linting, documentation checks, and the production build.

# Completion

- Final status: active pending verification, pull-request delivery, and production read-back.
