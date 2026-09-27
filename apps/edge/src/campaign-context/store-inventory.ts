import {
  COASTLINE_INVENTORY,
  COASTLINE_LOCATIONS,
  COASTLINE_MENU,
  COASTLINE_RECIPES,
  type CoastlineLocationId,
} from "../../../../packages/knowledge-graph/src/coastline.ts";

/**
 * A mocked store inventory system for Coastline Kitchen. Usage comes from the menu's recipes and
 * each restaurant's size; on-hand stock and deliveries on order are randomized per location and
 * day, so they change daily but are stable within a day. Every figure is invented.
 */

/** Typical servings of each dish per day at a restaurant with 10,000 app users. */
const BASE_SERVINGS_PER_DAY = 40;
/** Restaurants aim to hold three days of typical use. */
export const PAR_DAYS = 3;

export type StockLevel = {
  id: string;
  name: string;
  unit: string;
  onHand: number;
  /** Already ordered and due within the next three days. */
  onOrder: number;
  parLevel: number;
  avgDailyUse: number;
  daysOfCover: number;
};

/** A small seeded generator (mulberry32), so a location's stock is the same all day. */
function seeded(seed: string) {
  let state =
    [...seed].reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619), 2166136261) >>>
    0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (value: number) => Math.round(value * 10) / 10;

export function locationInventory(location: CoastlineLocationId, date: string) {
  const store = COASTLINE_LOCATIONS.find((entry) => entry.id === location);
  if (!store) return null;
  const servings = BASE_SERVINGS_PER_DAY * (store.appUsers / 10_000);
  const use = new Map<string, number>();
  for (const item of COASTLINE_MENU)
    for (const [inventory, perServing] of COASTLINE_RECIPES[item.name] ?? [])
      use.set(inventory, (use.get(inventory) ?? 0) + servings * perServing);
  const random = seeded(`${location}:${date}`);
  const items: StockLevel[] = COASTLINE_INVENTORY.map((item) => {
    const avgDailyUse = round(use.get(item.id) ?? 0);
    const parLevel = round(avgDailyUse * PAR_DAYS);
    // Most items sit near par; some run well below it. About half have a delivery coming.
    const onHand = round(parLevel * (0.5 + random() * 0.9));
    const onOrder = random() < 0.65 ? round(parLevel * (0.5 + random() * 0.6)) : 0;
    return {
      id: item.id,
      name: item.name,
      unit: item.unit,
      onHand,
      onOrder,
      parLevel,
      avgDailyUse,
      daysOfCover: avgDailyUse ? round(onHand / avgDailyUse) : 0,
    };
  });
  return {
    location,
    city: store.city,
    countedAt: date,
    source: "Store inventory (randomized mock)",
    items,
  };
}
