---
id: WU-045
title: Use-case library, with sales and service use cases on new external services
status: active
plan_sections: [10, 12, 15]
owners: [agent]
---

# Why

Andrew Bauer asked for three things:

- Replace the Quickstart dialog with an interactive use-case library that shows each scenario, the systems involved, and the data flow.
- Build one sales and one service use case. Each should use a new external service and rely on the knowledge graph for a key element.
- Draft 10–15 more use cases, shown greyed out as "Coming soon".

## Changes

- **Use-case library** (`apps/web/src/usecases/`): a **Use cases** page in the left rail replaces the Quickstart dialog, and the header button opens it too.
  - Scenarios can be filtered by team (Marketing, Sales, Service).
  - Each has its situation, **Try it** prompts (the prompt goes into the chat box and is not sent), a numbered data flow, what the graph contributes, the systems involved, what it writes, and what to watch for.
  - It has 12 available use cases and 13 drafted "Coming soon" ones. The drafts are greyed out, marked `aria-disabled`, and can't be selected.
- **New external-services MCP server** (`apps/edge/src/external-services/`, prefix `ext_`), in-process like the others. Both APIs are free and keyless:
  - `get_public_holidays`: upcoming public holidays for a country from Nager.Date. It crosses year boundaries.
  - `get_weather_alerts`: active National Weather Service alerts at a Coastline Kitchen location, most severe first. When there are none there, it lists alerts elsewhere in California. It sends a User-Agent, as NWS requires.
  - A failed call returns an MCP tool error, and the answer says so.
- **Two new graph tools**, each with fixed Cypher, an identical fixture, and evidence paths:
  - `plan_account_outreach`: an account's contacts in priority order, with the channels each has consented to and the account's headquarters country. Accounts now have a country.
  - `assess_location_impact`: the app audience near a location, how many can be notified by push, and the active campaigns targeting them.
- **Sales use case (buyer-group outreach around local holidays):** `plan_account_outreach` → `get_public_holidays`. The graph supplies who to contact, how they may be contacted, and which country's holidays apply.
- **Service use case (severe-weather customer impact):** `get_weather_alerts` → `assess_location_impact`. The graph supplies who is affected, who can be reached, and which campaigns to pause. Counts are aggregate only.
- **Routing:** tool plans and prompt guidance for both use cases. The workspace shows public-holiday and weather-alert cards.
- **Evals:** routing cases 23–24, and the `demo-sales-outreach` and `demo-service-weather` scenarios.
- **Learn:** a new *use-case library* lesson with a diagram. Reference entries cover the four tools. Tool counts, the MCP server table (now four servers), and every Quickstart mention are updated.

## Acceptance criteria

- The Use cases page lists available and coming-soon use cases, and each available one shows its scenario, prompts, systems, and data flow.
- Both new use cases call a live external service and a graph tool, and nothing is sent or written.
- The graph tools return the same answers from Neo4j and from the fixture.

## Verification

```text
pnpm verify
pnpm test:e2e
pnpm kg:seed --confirm --reset && pnpm kg:parity
```

## External mutations

- **Neo4j:** the `northstar-kg-v2` dataset was reseeded so accounts carry their country (1,657 nodes, 14,198 relationships). The memory dataset was untouched.
- **Nager.Date and NWS:** read-only public requests. No customer data is sent.

## Evidence

- `pnpm verify` passes 13 gates, and `pnpm test:e2e` passes 32 tests in Chrome and Edge, including the new use-case library test. The screenshots are in `artifacts/evidence/WU-045/`.
- Graph parity: all 42 calls match, with p50 102 ms and p95 232 ms.
- In live runs on gpt-oss-20b, both new use cases called their tools in order and answered from live Nager.Date and NWS data. San Diego had active NWS alerts at the time.
