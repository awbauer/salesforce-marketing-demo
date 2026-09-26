import type { LocationId } from "./open-meteo";

/**
 * Mocked profile for a fictional California fast-casual restaurant. All names, menu items, and
 * figures are invented demo data; audience facts are aggregates with no customer records.
 */
export const RESTAURANT_PROFILES = {
  "coastline-kitchen": {
    id: "coastline-kitchen",
    name: "Coastline Kitchen",
    concept:
      "Fast-casual California comfort food with fresh, made-to-order bowls, burritos, and drinks",
    hours: "Open 24 hours, 7 days a week",
    location: {
      id: "los-angeles" satisfies LocationId,
      city: "Los Angeles",
      neighborhood: "Arts District",
      address: "100 Example Street, Los Angeles, CA (fictional)",
      service: ["counter ordering", "app order-ahead", "delivery"],
    },
    brandVoice:
      "Warm, sunny, and a little playful. Short sentences, no ALL CAPS, at most one emoji.",
    menu: [
      {
        item: "Chile Verde Breakfast Burrito",
        price: 9.5,
        dayparts: ["early morning", "breakfast"],
        serves: "hot",
        tags: ["comfort", "best seller"],
      },
      {
        item: "Açaí Sunrise Bowl",
        price: 11,
        dayparts: ["breakfast", "lunch", "afternoon"],
        serves: "cold",
        tags: ["fresh", "vegetarian"],
      },
      {
        item: "Horchata Cold Brew",
        price: 5.5,
        dayparts: ["early morning", "breakfast", "afternoon"],
        serves: "cold",
        tags: ["drink"],
      },
      {
        item: "Citrus Chicken Grain Bowl",
        price: 13,
        dayparts: ["lunch", "dinner"],
        serves: "warm",
        tags: ["high protein", "best seller"],
      },
      {
        item: "Baja Fish Tacos",
        price: 12,
        dayparts: ["lunch", "afternoon", "dinner"],
        serves: "warm",
        tags: ["seasonal"],
      },
      {
        item: "Spicy Tortilla Soup",
        price: 8,
        dayparts: ["lunch", "dinner", "late night"],
        serves: "hot",
        tags: ["comfort", "rainy-day favorite"],
      },
      {
        item: "Garlic Noodle Bowl",
        price: 14,
        dayparts: ["dinner", "late night"],
        serves: "hot",
        tags: ["comfort"],
      },
      {
        item: "Carne Asada Fries",
        price: 12.5,
        dayparts: ["dinner", "late night"],
        serves: "hot",
        tags: ["late-night favorite", "shareable"],
      },
      {
        item: "Watermelon Mint Agua Fresca",
        price: 4.5,
        dayparts: ["breakfast", "lunch", "afternoon", "dinner"],
        serves: "cold",
        tags: ["drink", "hot-day favorite"],
      },
      {
        item: "Mango Chili Smoothie",
        price: 7,
        dayparts: ["afternoon", "late night"],
        serves: "cold",
        tags: ["drink"],
      },
    ],
    favorites: [
      { item: "Chile Verde Breakfast Burrito", note: "Top seller from 5 to 10 a.m." },
      { item: "Carne Asada Fries", note: "Top seller after 10 p.m." },
      { item: "Citrus Chicken Grain Bowl", note: "Most reordered lunch item" },
    ],
    dayparts: {
      "early morning": "4:00–7:00",
      breakfast: "7:00–10:30",
      lunch: "10:30–14:00",
      afternoon: "14:00–17:00",
      dinner: "17:00–21:00",
      "late night": "21:00–4:00",
    },
    audience: {
      appUsersWithPushEnabled: 18400,
      pushOpenRate: 0.074,
      busiestDayparts: ["lunch", "late night"],
      note: "Aggregate, fictional figures. No individual customer data.",
    },
    promotionRules: [
      "Draft only; campaigns are never scheduled or sent from this tool.",
      "Offers may not exceed 20% off.",
      "Late-night messages must not mention alcohol.",
    ],
  },
} as const;

export type RestaurantId = keyof typeof RESTAURANT_PROFILES;
export const RESTAURANT_IDS = Object.keys(RESTAURANT_PROFILES) as [RestaurantId, ...RestaurantId[]];
