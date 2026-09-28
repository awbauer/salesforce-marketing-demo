---
id: WU-050
title: Financial services use cases — regulated content on the news, an embargoed acquisition, and an AUM account plan
status: active
plan_sections: [10, 12, 15]
owners: [agent]
---

# Why

Andrew Bauer asked for one or two financial services scenarios that show the power of the tools and the graph. He suggested four themes: financial services news, pre-approved assets for regulated content marketing, releasing approved content quickly ahead of M&A, and building and activating an account plan to grow AUM.

They became two scenarios, shown as three use cases:

1. **Regulated content, released fast.** It has two triggers:
   - live Federal Reserve news
   - an embargoed acquisition announcement
2. **An account plan to grow AUM.** Activating it hands the plan to the Campaign Creation agent.

## Changes

- **Graph: Harborstone Wealth**, a fictional wealth-management brand under Northstar, in `packages/knowledge-graph/src/harborstone.ts`. It has its own seed, so every existing node and relationship is unchanged.
  - **Regulated content.** Each `ContentAsset` has:
    - `APPROVED_UNDER` an `Approval`: approved, expired, or pending, with dates and any embargo
    - `REQUIRES` a `Disclosure` for each disclosure it must carry
    - `APPROVED_FOR` a channel
    - `PASSED`/`FAILED` results for each Harborstone compliance rule, such as FINRA 2210 fair and balanced
  - **Market events.** News responses `RESPONDS_TO` a `MarketEvent`: rate increase, cut, hold, or volatility. Six past `ClientSend`s record how many hours after the news each response went out, and how it performed.
  - **Acquisition.** The `Deal` acquires a `Firm`. Its package is `RELEASED_WITH` the deal, with each asset's step, timing, and consent basis, and `ADDRESSED_TO` an audience segment. The acquired firm's clients hold only transactional (service notice) consent.
  - **Clients.** 12 institutional `Client`s: foundations, businesses, and family offices, never individuals. Each has:
    - `HOLDS` a `Product`, with its AUM
    - `HAS_SIGNAL` a `Signal`, which `SUGGESTS` products, with a capture share and a reason
    - `COVERED_BY` an `Advisor`
    - contacts (`Persona`) with consent by channel and engagement with approved content
- **Three graph tools**, each with Cypher and a parity-checked fixture implementation:
  - `match_news_to_approved_content(event, channel)` returns:
    - the approved assets that are ready, with approval ID, expiry, disclosures, and reach under marketing consent
    - the blocked assets, with each reason
    - audience opt-ins
    - past response speed against opens
  - `prepare_deal_release(deal)` returns the package in release order: timing, audience, consent basis and reach, the embargoed approval, disclosures, and blockers. A failed compliance check or missing consent blocks a piece.
  - `build_aum_account_plan(client)` returns:
    - AUM, the held-away estimate, and wallet share
    - signals, newest first
    - plays: products not held, sized from the held-away estimate, with peer adoption among clients of the same type and approved evergreen content (event-timed news content is excluded)
    - contacts ranked with a `channelForPlayContent`
    - anyone whose consented channels have no approved content
- **Live news:** `get_fed_announcements`, on the external-services MCP, reads the Federal Reserve's public monetary-policy RSS feed (keyless). It finds the latest FOMC statement, reads its rate decision sentence (raise, lower, or maintain, with the size and target range), and maps it to the market event.
- **Routing:**
  - Fed or rate news with a content question → Fed → content.
  - Market volatility → content.
  - An acquisition → the deal release.
  - An account plan, AUM, or a Harborstone client → the account plan.
  - "Create a Marketing Cloud campaign …" still goes to the Campaign Creation agent's brief. Its guidance now builds the objective from the approved assets, their approval IDs, and disclosures.
  - Scenario guidance forbids new regulated copy, rewriting approved copy, market predictions, and promised returns.
- **Policy router fix:** a question about what to send, after some context ("The Fed moved rates. What can we send clients?"), was refused as a send request. Each sentence that names an action is now judged on its own. "Publish it. What next?" and "Context. Send it." are still refused.
- **Evaluations:**
  - Three routing cases and three demo scenarios were added.
  - Graph grounding now also checks `Client` names and `Approval` IDs, because an invented approval ID is a compliance failure.
- **UI:**
  - The use-case library has three new use cases, a **Financial services** filter, and an industry badge.
  - Sources shows "Rate news · Federal Reserve".
  - The workspace gets a Federal Reserve card, and graph cards for the three tools.
  - The graph explorer has a Harborstone Wealth node-type group, relationship phrases, and two tours. Its brand filter picks up Harborstone automatically.
- **Learn:**
  - Routing, the policy router, GraphRAG, the use-case library, evaluations, workspace, and governance are updated, plus reference entries for every new tool, node, and relationship.
  - `docs/learn.md` is regenerated.

## Acceptance criteria

- The Fed prompt reads the live decision, then lists only approved, unexpired assets that pass compliance, with approval IDs and disclosures. It names every blocked asset and its reason.
- The acquisition prompt returns the package in release order. Service notices reach the acquired firm's clients; marketing to them is blocked.
- The account plan ranks plays by opportunity. Each touch uses approved content on a channel it's approved for and the contact consented to.
- Nothing is sent or released from chat. Campaigns go through the Campaign Creation agent and a confirmation.

## Verification

```text
pnpm verify
pnpm test:e2e
pnpm kg:seed --confirm && pnpm kg:parity
node scripts/run-live-evals.mjs --models @cf/openai/gpt-oss-20b --cases demo-fsi-fed-news,demo-fsi-deal-release,demo-fsi-aum-plan,routing-26,routing-27,routing-28 --trials-demo 3 --trials-routing 1
```

## External mutations

- **Neo4j:** reseeded `northstar-kg-v2` to 2,439 nodes and 20,345 relationships. The addition is additive; the existing nodes and relationships are unchanged.

## Evidence

- **Graph parity:** all 73 calls match between Neo4j and the fixture, including all 12 account plans; p50 67 ms, p95 291 ms.
- **Live on gpt-oss-20b through the production pipeline:** 12 of 12 turns pass every check, including graph grounding on approval IDs. That's 3 trials of each demo scenario and one of each new routing case. The live Fed feed returned the September 16 FOMC statement (raise by 1/4 point to 3-3/4 to 4 percent).
- **The "model alone, no routers" diagnostic suite:** the model picked the right tool for the deal prompt but not the other two, which is why these intents are routed deterministically.
