# ADR-003: Bind the non-sandbox Northstar demo org by exact ID

## Status

Accepted on 2026-09-20 by explicit user instruction.

## Context

The authorized `northstar-pot` org is the supplied disposable proof environment with sample data, but Salesforce reports `Organization.IsSandbox = false` and `OrganizationType = Enterprise Edition`. The repository previously required the platform sandbox flag and therefore stopped before deployment.

## Decision

Treat this one org as the Phase 2 proof environment while retaining a fail-closed target gate. Every org-backed command must pass the explicit alias `northstar-pot`. Validation requires `SF_APPROVED_PROOF_ORG_ID` to equal the authoritative `Organization.Id` returned by that alias. The org ID remains an execution-time value and is not committed.

This exception does not authorize any other non-sandbox org, implicit default org, production data, publish/send/activate actions outside the Agentforce metadata lifecycle, or writes beyond the three Section 17 proof write types.

## Consequences

- Alias reassignment or a missing/mismatched approved org ID stops validation before business-data checks or deployment.
- Evidence must describe the target as a dedicated proof/demo org rather than falsely claiming Salesforce reports it as a sandbox.
- The user-approved classification exception is visible to future agents without embedding credentials or the org ID in source control.
