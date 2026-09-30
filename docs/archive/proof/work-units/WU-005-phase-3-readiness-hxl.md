---
id: WU-005
title: Deliver the first Phase 3 readiness HXL card
status: complete
plan_sections: [3, 9, 13, 14, 15, 16, 17]
owners: [agent]
---

# Objective

Deploy one Northstar campaign-readiness HXL widget and its custom Lightning type mapping, while preserving an equivalent accessible native React fallback when HXL is unavailable or rejected.

## Scope

- In-scope paths: `salesforce/force-app/main/default/uiWidgets/`, `salesforce/force-app/main/default/lightningTypes/`, `packages/contracts/`, `packages/ui/`, `apps/web/`, Phase 3 tests, documentation, and `artifacts/` evidence.
- Explicitly out of scope: new Salesforce tools or write classes, changes to the 13-tool catalog, arbitrary iframe permissions, HXL input/editors, image generation, and the two additional standard-agent cards required by the full Phase 3 exit.
- Prerequisites: API 67.0 metadata support in the exact approved org, HXL beta enablement for live rendering, and the existing `NorthstarValidateCampaignContent.Output` structured type.

## Contracts affected

- Schemas: portable-card presentation metadata and readiness-card payload.
- Tools/actions: none; the approved 13-tool surface is unchanged.
- Tiles/HXL: `northstarCampaignReadiness` UiWidgetBundle, its Apex-based LightningTypeBundle, and the existing native readiness tile fallback.
- External state: two net-new Northstar metadata bundles in the supplied proof org; no record writes.

## Acceptance criteria

- [x] Source-controlled API 67.0 UiWidgetBundle and LightningTypeBundle validate against the existing readiness output type.
- [x] The readiness tile contract selects HXL only for a verified resource and otherwise renders the equivalent native card.
- [x] HXL mapping, schema, CSP/sandbox policy, fallback parity, and accessibility checks pass locally.
- [x] The metadata deploys to the exact approved proof org and is retrieved/read back under its Northstar names.
- [x] Documentation and evidence distinguish source validation, deployed metadata, and rendering surfaces actually demonstrated.
- [x] No tool catalog, proof boundary, write class, or Section 17 default changes.

## Verification

```text
pnpm hxl:check
pnpm test:unit
pnpm test:e2e
pnpm verify
sf project deploy validate --target-org northstar-pot --metadata-dir <assembled-hxl-metadata-package>
```

## External mutations

Deploy only the net-new `northstarCampaignReadiness` UiWidgetBundle and `northstarCampaignReadinessOutput` LightningTypeBundle to the exact approved proof org after validation. Read back both metadata components by full name. If HXL beta is not enabled, stop before deployment and record the missing capability; do not substitute another renderer.

## Evidence

- Reports: `artifacts/reports/WU-005/hxl.json` records the passing source contract. `hxl-capability.json` records API 67.0 capability discovery, deployment, and authoritative component read-back.
- Screenshots: `artifacts/evidence/WU-005/native-fallback-{chrome,edge}.png` captures accessible fallback parity. No compatible HXL host surface was claimed or captured in this work unit.
- Deployment identifiers: validation `0AfjV000002kRIbSAM`; deployment `0AfjV000002kRP3SAM`.
- Read-back results: Salesforce metadata inventory returned `northstarCampaignReadiness` as `UiWidgetBundle` and `northstarCampaignReadinessOutput` as `LightningTypeBundle`, with modification timestamps matching the successful deployment.
- Known limitations: the installed Salesforce CLI registry cannot infer or retrieve `UiWidgetBundle` in source format, so validation and deployment used the equivalent explicit Metadata API package and read-back used the metadata inventory API. This work unit proves only the first of the three required HXL-backed outputs and does not by itself complete Phase 3; HXL Playground and compatible-host rendering remain Phase 3 follow-on evidence.

## Completion

- Final status: complete; the scoped two-component deployment and read-back passed, and the native fallback remains available when the HXL resource is not advertised by the host.
- Commit: pending final evidence commit.
- Summary: delivered the first source-controlled readiness HXL widget and Lightning type without widening the tool or write surface.
