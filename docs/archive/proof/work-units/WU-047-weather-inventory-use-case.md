---
id: WU-047
title: Service use case — weather-driven inventory check with a store-manager case
status: active
plan_sections: [10, 12, 15]
owners: [agent]
---

# Why

Andrew Bauer asked for a new service use case with five steps:

1. Check the upcoming weather.
2. Review menu items likely to be in high demand.
3. Check inventory for each location (mocked and randomized is fine).
4. Review the mapping of inventory items to menu items to weather patterns.
5. Open a Salesforce case with the store manager if an item is running low.

## Changes

- **Forecast:** `get_weather_forecast` (campaign-context MCP) reads Open-Meteo's daily forecast and buckets each day for demand planning:
  - heat: a high of 88°F or more
  - rain: a wet or stormy day, or at least a 60% chance of rain
  - otherwise fog, cloudy, or clear
- **Graph, the key element:**
  - New `InventoryItem` and `StoreManager` nodes.
  - `MADE_WITH` links each menu item to what a serving uses. `MANAGED_BY` links each location to its manager.
  - `LIFTS_DEMAND` links weather to a dish when the dish's average order rate under that weather is at least 15% above its overall average, learned from the 1,500 past push sends.
  - The new tool `map_weather_demand` returns the lifted dishes, their inventory, and the manager, with evidence paths.
  - The graph holds the manager's name only, never contact details.
- **Inventory:** `get_location_inventory` is a randomized store inventory mock, seeded by location and day. For each item it reports on hand, deliveries on order within three days, par level (three days of use), typical daily use from the recipes, and days of cover.
- **Risk is decided by code** (`inventory-risk.ts`):
  - An item's forecast need is its typical daily use on each day, raised by the lift on days whose weather lifts a dish made with it.
  - An item is low when on hand plus on order won't cover that need.
  - The result becomes an **Inventory risk** card and an action card.
  - The answer step's system prompt is rebuilt so the model presents exactly this list.
- **Case write:** `create-inventory-case` → `create_inventory_case` → Apex `NorthstarCreateInventoryCase`.
  - The request hash is the SHA-256 of the exact case contents. Apex verifies the HMAC-signed confirmation, re-hashes the contents it received, and refuses any mismatch.
  - It finds the manager's Contact by title and restaurant and creates the Case in user mode.
  - It's idempotent through `Case.Northstar_Idempotency_Key__c`, and it reads the Case back.
- **Permission check:** `check_write_access` now covers the case: Create Case, the Subject, Description, and Contact fields, and Read Contact. The evaluator permission set grants Case create/read, Contact read, the idempotency field, and the class.
- **UI:**
  - The confirmation card lists each low item: on hand, on order, needed, and the dishes it goes into.
  - A success banner links to the Case.
  - The use-case catalog has the new **Weather-driven inventory check** (Service).
  - The graph explorer shows the new labels and relationships.
- **Local fixture:** a fixed one-heat-day forecast and count date run the same three tools, ingestion, and risk check, so local development and E2E are deterministic.
- **Seed:** `salesforce/scripts/seed-coastline-store-managers.apex` upserts the five fictional store managers as Contacts on "Coastline Kitchen (fictional)".
- **Tool count:** the curated Salesforce catalog goes from 17 to 18 tools.

## Acceptance criteria

- The inventory prompt runs forecast → graph → inventory, and the workspace shows Forecast, Store inventory, and Inventory risk cards.
- Low items come from code. The action card, confirmation, and Case all list the same items.
- The Case is created only after confirmation, is verified against the confirmed hash, and is read back from Salesforce.

## Verification

```text
pnpm verify
pnpm test:e2e
pnpm kg:seed --confirm --reset && pnpm kg:parity
sf apex run test --class-names NorthstarInventoryCaseTest
node scripts/run-live-evals.mjs --cases demo-service-inventory,routing-25 --trials-demo 1 --trials-routing 1
```

## External mutations

- **Proof org:** deployed the `Case.Northstar_Idempotency_Key__c` field, the `NorthstarCreateInventoryCase` class and its tests, the updated `NorthstarCheckWriteAccess`, the permission set, and the MCP server definition (18 tools). Seeded five store-manager Contacts.
- **Neo4j:** reseeded `northstar-kg-v2` to 1,677 nodes and 14,233 relationships.
- **Production D1:** applied `0005_inventory_case_action.sql`; all 8 existing audit rows were kept.
- **Cloudflare portal, needed:** enable `create_inventory_case` on the Salesforce server. Until then, the new Worker reports it missing.

## Evidence

- `NorthstarInventoryCaseTest`: 3 of 3 pass in the org. The tests cover create and replay, a tampered-contents rejection, and the permission checks.
- Graph parity: all 45 calls match; p50 124 ms, p95 260 ms.
- Live on gpt-oss-20b, `demo-service-inventory` passed with live Open-Meteo data. The routing pipeline chose forecast → graph → inventory on all three models.
- E2E, Chrome and Edge: prompt → cards → action card → confirmation with the low-item table → Case banner (`artifacts/evidence/WU-047/`).
