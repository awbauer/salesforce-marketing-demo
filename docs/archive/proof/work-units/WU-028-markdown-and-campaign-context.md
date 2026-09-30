---
id: WU-028
title: Markdown answers, gpt-oss-20b, and a weather-aware restaurant push scenario
status: active
plan_sections: [10, 13, 16, 17]
owners: [agent]
---

# Objective

Assistant answers render as Markdown, the orchestrator runs on gpt-oss-20b (ADR-005), and a new demo scenario drafts a push campaign for a fictional California fast-casual restaurant from mocked restaurant data, live weather, and the existing Salesforce content tool.

## Behavior

- **Markdown:** the system prompt allows concise Markdown. Chat renders it with `react-markdown` and GFM tables, with raw HTML skipped, images dropped, and links opening in a new tab. `unwrapAssistantText` keeps the JSON-envelope recovery; plain-text stripping remains only for trace and error text.
- **Campaign-context MCP:** `northstar-campaign-context` (MCP SDK v2) exposes `get_restaurant_profile` and `get_current_weather` (Open-Meteo, keyless). It is served at `/mcp/campaign-context` behind Access, and used in-process by the orchestrator through an in-memory MCP transport, so production and external clients share one server.
- **Tool plans:** the intent router can force an ordered plan. A push-campaign request runs restaurant profile, then weather, then `draft_campaign_content`, then a text answer. The scenario guidance is added to the system prompt only while that plan is active.
- **Forced-tool guard:** also recovers tool arguments leaked into answer text, not just reasoning, and hides that text from the user.
- **Sources:** the rail lists "Restaurant data" and "Weather · Open-Meteo", with status dots that follow `DISABLED_TOOLS`.
- **Evaluations:**
  - The plain-text check is retired.
  - The runner includes the push scenario, scored on the full planned sequence, with the real campaign-context MCP and fixture Salesforce tools.
  - `pnpm eval:rescore` re-derives the published run under the current checks with no model calls, which changed 28 outcomes.
  - The runner accepts `--out` for smoke runs that don't overwrite the published report.

## Evidence

- **Live smoke with gpt-oss-20b:** `artifacts/evidence/WU-028/push-scenario-smoke.json`, 14/14 demo turns.
  - Both push runs called profile → weather → content and returned Markdown drafts with live Los Angeles conditions.
  - The first smoke run found 3 failures: leaked JSON answer text, and the restaurant guidance steering unrelated prompts. Both were fixed before this result.
- **Rename:** the fictional restaurant was later renamed from "Sunwise Kitchen" to "Coastline Kitchen". The smoke evidence file records the name used at the time of the run.
- **Screenshots:** `artifacts/evidence/WU-028/markdown-and-sources-{chrome,edge}.png`, showing rendered Markdown and the new sources.

## Acceptance criteria

- [x] Worker tests: Open-Meteo mapping and failures, both MCP tools in-process and over streamable HTTP, tool plans and missing-tool handling, and text-leak salvage.
- [x] E2E in Chrome and Edge: Markdown renders as elements, and the new sources are visible.
- [x] `pnpm verify` passes.
- [ ] After deploy: run the push scenario in production against the live Salesforce Content Builder.

## Verification

```text
pnpm verify
pnpm exec playwright test tests/e2e/workbench.spec.ts
pnpm eval:live --models @cf/openai/gpt-oss-20b --trials-demo 2 --trials-routing 0 --out <scratch>
```
