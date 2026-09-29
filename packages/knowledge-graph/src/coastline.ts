/**
 * Coastline Kitchen, a fictional fast-casual restaurant brand under Northstar. This is the
 * restaurant system's own data: its brand, locations, menu, dayparts, and app audience. The
 * restaurant-data tool serves it directly, and the knowledge graph links to the same entities
 * by id. Every name and figure is invented.
 */

export const NORTHSTAR_BRAND = { id: "brand-northstar", name: "Northstar" } as const;

export type Serves = "hot" | "cold" | "warm";

export const DAYPARTS = [
  "early-morning",
  "breakfast",
  "lunch",
  "afternoon",
  "dinner",
  "late-night",
] as const;
export type Daypart = (typeof DAYPARTS)[number];

export const DAYPART_HOURS: Record<Daypart, string> = {
  "early-morning": "4:00–7:00",
  breakfast: "7:00–10:30",
  lunch: "10:30–14:00",
  afternoon: "14:00–17:00",
  dinner: "17:00–21:00",
  "late-night": "21:00–4:00",
};

/** Weather-tool city ids double as location ids, so weather and pushes line up. */
export const COASTLINE_LOCATIONS = [
  {
    id: "los-angeles",
    city: "Los Angeles",
    neighborhood: "Arts District",
    address: "100 Example Street, Los Angeles, CA (fictional)",
    appUsers: 18400,
    pushOptIns: 11900,
    emailOptIns: 13100,
    smsOptIns: 5200,
  },
  {
    id: "san-francisco",
    city: "San Francisco",
    neighborhood: "Mission",
    address: "200 Example Street, San Francisco, CA (fictional)",
    appUsers: 12100,
    pushOptIns: 7300,
    emailOptIns: 8900,
    smsOptIns: 3100,
  },
  {
    id: "san-diego",
    city: "San Diego",
    neighborhood: "North Park",
    address: "300 Example Street, San Diego, CA (fictional)",
    appUsers: 9800,
    pushOptIns: 6600,
    emailOptIns: 7000,
    smsOptIns: 2600,
  },
  {
    id: "sacramento",
    city: "Sacramento",
    neighborhood: "Midtown",
    address: "400 Example Street, Sacramento, CA (fictional)",
    appUsers: 6200,
    pushOptIns: 3500,
    emailOptIns: 4300,
    smsOptIns: 1500,
  },
  {
    id: "fresno",
    city: "Fresno",
    neighborhood: "Tower District",
    address: "500 Example Street, Fresno, CA (fictional)",
    appUsers: 4700,
    pushOptIns: 2400,
    emailOptIns: 3100,
    smsOptIns: 1200,
  },
] as const;
export type CoastlineLocationId = (typeof COASTLINE_LOCATIONS)[number]["id"];

export const COASTLINE_MENU: ReadonlyArray<{
  name: string;
  price: number;
  serves: Serves;
  dayparts: readonly Daypart[];
  tags: readonly string[];
}> = [
  {
    name: "Chile Verde Breakfast Burrito",
    price: 9.5,
    serves: "hot",
    dayparts: ["early-morning", "breakfast"],
    tags: ["comfort", "best seller"],
  },
  {
    name: "Açaí Sunrise Bowl",
    price: 11,
    serves: "cold",
    dayparts: ["breakfast", "lunch", "afternoon"],
    tags: ["fresh", "vegetarian"],
  },
  {
    name: "Horchata Cold Brew",
    price: 5.5,
    serves: "cold",
    dayparts: ["early-morning", "breakfast", "afternoon"],
    tags: ["drink"],
  },
  {
    name: "Citrus Chicken Grain Bowl",
    price: 13,
    serves: "warm",
    dayparts: ["lunch", "dinner"],
    tags: ["high protein", "best seller"],
  },
  {
    name: "Baja Fish Tacos",
    price: 12,
    serves: "warm",
    dayparts: ["lunch", "afternoon", "dinner"],
    tags: ["seasonal"],
  },
  {
    name: "Spicy Tortilla Soup",
    price: 8,
    serves: "hot",
    dayparts: ["lunch", "dinner", "late-night"],
    tags: ["comfort", "rainy-day favorite"],
  },
  {
    name: "Garlic Noodle Bowl",
    price: 14,
    serves: "hot",
    dayparts: ["dinner", "late-night"],
    tags: ["comfort"],
  },
  {
    name: "Carne Asada Fries",
    price: 12.5,
    serves: "hot",
    dayparts: ["dinner", "late-night"],
    tags: ["late-night favorite", "shareable"],
  },
  {
    name: "Watermelon Mint Agua Fresca",
    price: 4.5,
    serves: "cold",
    dayparts: ["breakfast", "lunch", "afternoon", "dinner"],
    tags: ["drink", "hot-day favorite"],
  },
  {
    name: "Mango Chili Smoothie",
    price: 7,
    serves: "cold",
    dayparts: ["afternoon", "late-night"],
    tags: ["drink"],
  },
];

export const COASTLINE = {
  id: "brand-coastline-kitchen",
  restaurantId: "coastline-kitchen",
  name: "Coastline Kitchen",
  parentBrand: NORTHSTAR_BRAND,
  concept:
    "Fast-casual California comfort food with fresh, made-to-order bowls, burritos, and drinks",
  hours: "Open 24 hours, 7 days a week",
  services: ["counter ordering", "app order-ahead", "delivery"],
  brandVoice: "Warm, sunny, and a little playful. Short sentences, no ALL CAPS, at most one emoji.",
  menu: { id: "menu-coastline-core", name: "Coastline core menu" },
  favorites: [
    { item: "Chile Verde Breakfast Burrito", note: "Top seller from 5 to 10 a.m." },
    { item: "Carne Asada Fries", note: "Top seller after 10 p.m." },
    { item: "Citrus Chicken Grain Bowl", note: "Most reordered lunch item" },
  ],
  promotionRules: [
    "Offers may not exceed 20% off",
    "No alcohol in late-night messages",
    "Warm, sunny, playful voice",
  ],
  pushOpenRate: 0.074,
  busiestDayparts: ["lunch", "late-night"] as Daypart[],
} as const;

export const slug = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export const menuItemId = (name: string) => `menu-${slug(name)}`;
export const locationNodeId = (id: string) => `location-${id}`;

/**
 * Stock each restaurant keeps for the menu, in the units the kitchen counts. The store inventory
 * system (a randomized mock) reports on-hand amounts for these; the graph maps them to the menu
 * items that use them and, through past push results, to the weather that lifts those items.
 */
export const COASTLINE_INVENTORY = [
  { id: "tortillas", name: "Flour tortillas", unit: "each" },
  { id: "eggs", name: "Eggs", unit: "each" },
  { id: "chile-verde", name: "Chile verde (prepped)", unit: "lb" },
  { id: "acai", name: "Açaí packs", unit: "pack" },
  { id: "cold-brew", name: "Cold brew concentrate", unit: "qt" },
  { id: "horchata-base", name: "Horchata base", unit: "qt" },
  { id: "chicken", name: "Citrus chicken (marinated)", unit: "lb" },
  { id: "grains", name: "Rice and grains (cooked)", unit: "lb" },
  { id: "fish", name: "Fish fillets", unit: "lb" },
  { id: "soup-base", name: "Tortilla soup base", unit: "gal" },
  { id: "noodles", name: "Garlic noodles", unit: "lb" },
  { id: "carne-asada", name: "Carne asada", unit: "lb" },
  { id: "fries", name: "Fries (frozen)", unit: "lb" },
  { id: "watermelon", name: "Watermelon", unit: "lb" },
  { id: "mango", name: "Mango purée", unit: "qt" },
] as const;
export type InventoryItemId = (typeof COASTLINE_INVENTORY)[number]["id"];

/** What one serving of each menu item uses, by inventory item. */
export const COASTLINE_RECIPES: Record<string, ReadonlyArray<[InventoryItemId, number]>> = {
  "Chile Verde Breakfast Burrito": [
    ["tortillas", 1],
    ["eggs", 2],
    ["chile-verde", 0.25],
  ],
  "Açaí Sunrise Bowl": [["acai", 2]],
  "Horchata Cold Brew": [
    ["cold-brew", 0.1],
    ["horchata-base", 0.1],
  ],
  "Citrus Chicken Grain Bowl": [
    ["chicken", 0.35],
    ["grains", 0.4],
  ],
  "Baja Fish Tacos": [
    ["fish", 0.3],
    ["tortillas", 3],
  ],
  "Spicy Tortilla Soup": [
    ["soup-base", 0.1],
    ["tortillas", 1],
  ],
  "Garlic Noodle Bowl": [["noodles", 0.5]],
  "Carne Asada Fries": [
    ["carne-asada", 0.3],
    ["fries", 0.5],
  ],
  "Watermelon Mint Agua Fresca": [["watermelon", 0.6]],
  "Mango Chili Smoothie": [["mango", 0.25]],
};

/**
 * Each restaurant's store manager, by name only: fictional people. The graph holds no contact
 * data; Salesforce finds the manager's Contact by title and restaurant when a case is opened.
 */
export const COASTLINE_STORE_MANAGERS: Record<CoastlineLocationId, { name: string }> = {
  "los-angeles": { name: "Rosa Delgado" },
  "san-francisco": { name: "Marcus Lee" },
  "san-diego": { name: "Priya Nair" },
  sacramento: { name: "Tom Okafor" },
  fresno: { name: "Elena Ruiz" },
};

export const inventoryItemId = (id: string) => `inventory-${id}`;
export const storeManagerId = (location: string) => `manager-${location}`;
