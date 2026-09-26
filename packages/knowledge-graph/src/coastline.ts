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
  },
  {
    id: "san-francisco",
    city: "San Francisco",
    neighborhood: "Mission",
    address: "200 Example Street, San Francisco, CA (fictional)",
    appUsers: 12100,
    pushOptIns: 7300,
  },
  {
    id: "san-diego",
    city: "San Diego",
    neighborhood: "North Park",
    address: "300 Example Street, San Diego, CA (fictional)",
    appUsers: 9800,
    pushOptIns: 6600,
  },
  {
    id: "sacramento",
    city: "Sacramento",
    neighborhood: "Midtown",
    address: "400 Example Street, Sacramento, CA (fictional)",
    appUsers: 6200,
    pushOptIns: 3500,
  },
  {
    id: "fresno",
    city: "Fresno",
    neighborhood: "Tower District",
    address: "500 Example Street, Fresno, CA (fictional)",
    appUsers: 4700,
    pushOptIns: 2400,
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
