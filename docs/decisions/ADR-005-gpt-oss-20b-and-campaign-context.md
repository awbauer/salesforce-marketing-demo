# ADR-005: Return to gpt-oss-20b and add a read-only campaign-context MCP

Status: accepted

Date: 2026-09-26

## Context

ADR-004 moved the orchestrator to `@cf/openai/gpt-oss-120b` using evidence gathered before three fixes: the forced-tool guard (WU-016, WU-017), precise intent routing (WU-027), and scoring corrections. The full evaluation after those fixes (#35), re-scored with Markdown allowed, shows:

| Model | Demo scenarios | Routing through the pipeline | Median demo latency |
|---|---|---|---|
| gpt-oss-20b | 29/30 | 40/40 | 3.2s |
| gpt-oss-120b | 29/30 | 37/40 | 5.4s |

gpt-oss-20b matches or beats 120b through the production pipeline, at about 60% of the latency and a fraction of the Workers AI cost. Andrew Bauer asked to return to gpt-oss-20b and to add a demo scenario that combines live weather and restaurant data with the existing campaign tools.

## Decision

- `PROOF_DEFAULTS.orchestratorModel` is `@cf/openai/gpt-oss-20b` again. It is still the only place the model is set.
- **New MCP server:** `northstar-campaign-context` is served at `/mcp/campaign-context` behind Cloudflare Access, and used in-process by the orchestrator through the MCP client. It has two read-only tools:
  - `get_restaurant_profile`: mocked, fictional Sunwise Kitchen data with menu, favorites, location, 24/7 hours, brand voice, aggregate audience facts, and promotion rules.
  - `get_current_weather`: live current conditions for a supported California city.
- **Weather source:** Open-Meteo (`api.open-meteo.com`). It is free for non-commercial use, needs no API key, and its data is CC BY 4.0, so answers credit "Weather data by Open-Meteo.com". Only city-center coordinates are sent; no user or customer data leaves the Worker.
- **Scenario:** a restaurant push-campaign request runs a forced plan (restaurant profile, then weather for its city, then the governed Salesforce `draft_campaign_content` tool), and the model writes the draft. Drafting stays with the governed Salesforce tool, and nothing is scheduled or sent.

## Consequences

- Open-Meteo is a new external read-only system. It has no credentials, and campaign drafting still degrades gracefully when it fails: the weather tool returns an MCP tool error that the model reports.
- Both context tools appear as sources in the UI and respond to `DISABLED_TOOLS`.
- Commercial use of Open-Meteo beyond this proof would need its paid API terms.

## Supersedes

ADR-004's model choice.
