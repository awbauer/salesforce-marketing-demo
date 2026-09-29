import type { InventoryRisk } from "../../../packages/contracts/src/index.ts";

/**
 * Weather-driven inventory risk, computed by code from three tool results: the forecast, the
 * knowledge graph's weather → dish → inventory mapping, and the store's stock counts. The model
 * explains the result; it never decides which items are low, so the action card and the
 * Salesforce case always carry exactly this list.
 */

export type ForecastResult = {
  location: string;
  city: string;
  days: Array<{ date: string; demandCondition: string; highF: number }>;
};
export type DemandResult = {
  locationId: string;
  city: string;
  found: boolean;
  manager: { name: string } | null;
  menuItems: Array<{ name: string; conditions: Array<{ condition: string; lift: number }> }>;
  inventoryItems: Array<{
    id: string;
    name: string;
    unit: string;
    usedBy: Array<{ menuItem: string; perServing: number }>;
  }>;
};
export type InventoryResult = {
  location: string;
  city: string;
  countedAt: string;
  items: Array<{
    id: string;
    name: string;
    unit: string;
    onHand: number;
    onOrder?: number;
    avgDailyUse: number;
  }>;
};

export type LowStockItem = {
  name: string;
  unit: string;
  onHand: number;
  onOrder: number;
  projectedNeed: number;
  menuItems: string[];
};

export type { InventoryRisk };

const round = (value: number) => Math.round(value * 10) / 10;

/** Null until all three results are in for the same location. */
export function assessInventoryRisk(
  forecast: ForecastResult | undefined,
  demand: DemandResult | undefined,
  inventory: InventoryResult | undefined,
): InventoryRisk | null {
  if (!forecast || !demand?.found || !demand.manager || !inventory) return null;
  if (forecast.location !== demand.locationId || inventory.location !== demand.locationId)
    return null;
  const lifts = new Map(
    demand.menuItems.map((item) => [
      item.name,
      new Map(item.conditions.map((entry) => [entry.condition, entry.lift])),
    ]),
  );
  const stock = new Map(inventory.items.map((item) => [item.id, item]));
  const lowItems: LowStockItem[] = [];
  for (const item of demand.inventoryItems) {
    const count = stock.get(item.id);
    if (!count) continue;
    // Each day uses the item's typical amount, raised by the biggest demand lift that day's
    // weather gives any dish made with it.
    const projectedNeed = forecast.days.reduce((sum, day) => {
      const lift = Math.max(
        1,
        ...item.usedBy.map((use) => lifts.get(use.menuItem)?.get(day.demandCondition) ?? 1),
      );
      return sum + count.avgDailyUse * lift;
    }, 0);
    // What's on hand plus deliveries already on order must cover the forecast.
    const onOrder = count.onOrder ?? 0;
    if (count.onHand + onOrder < projectedNeed)
      lowItems.push({
        name: item.name,
        unit: item.unit,
        onHand: count.onHand,
        onOrder,
        projectedNeed: round(projectedNeed),
        menuItems: item.usedBy.map((use) => use.menuItem),
      });
  }
  lowItems.sort(
    (a, b) => (a.onHand + a.onOrder) / a.projectedNeed - (b.onHand + b.onOrder) / b.projectedNeed,
  );
  const dates = forecast.days.map((day) => day.date).sort();
  return {
    locationId: demand.locationId,
    city: demand.city,
    manager: demand.manager,
    window: { from: dates[0] ?? "", to: dates.at(-1) ?? "", days: dates.length },
    conditions: [...new Set(forecast.days.map((day) => day.demandCondition))],
    lowItems: lowItems.slice(0, 15),
    checkedItems: demand.inventoryItems.length,
  };
}

/** The case contents the Salesforce action verifies against the signed request hash. */
export function inventoryCaseDetails(risk: InventoryRisk) {
  return JSON.stringify({
    locationId: risk.locationId,
    city: risk.city,
    managerName: risk.manager.name,
    window: risk.window,
    conditions: risk.conditions,
    items: risk.lowItems.map((item) => ({
      name: item.name,
      unit: item.unit,
      onHand: item.onHand,
      onOrder: item.onOrder,
      projectedNeed: item.projectedNeed,
      menuItems: item.menuItems,
    })),
  });
}

/** The computed inventory check for the model's answer, so it presents exactly this list. */
export function inventoryRiskPrompt(risk: InventoryRisk | null) {
  if (!risk) return "";
  const items = risk.lowItems
    .map(
      (item) =>
        `${item.name}: ${item.onHand} ${item.unit} on hand and ${item.onOrder} on order, ${item.projectedNeed} needed for ${item.menuItems.join(", ")}`,
    )
    .join("; ");
  return `Inventory check computed by the workbench for Coastline Kitchen ${risk.city} (${risk.window.from} to ${risk.window.to}, ${risk.conditions.join(", ")}; store manager ${risk.manager.name}): ${risk.lowItems.length ? `low items: ${items}.` : `no weather-driven item is low (${risk.checkedItems} checked).`}`;
}
