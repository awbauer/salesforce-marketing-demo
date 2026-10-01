import type { IndustryPack } from "../../contracts/src/pack.ts";
import { CORE_USE_CASES } from "./retail.ts";

export const restaurant: IndustryPack = {
  id: "restaurant",
  label: "Restaurants and food service",
  tier: "vertical",
  summary:
    "Weather-aware app campaigns, store inventory risk and service recovery for a restaurant brand, plus catering partners.",
  modules: { restaurant: true, wealth: false },
  vocabulary: {
    accounts: [
      { name: "Bayside Corporate Catering", country: "US", countryName: "United States" },
      { name: "Metro Office Lunch Co.", country: "US", countryName: "United States" },
      { name: "Harbourfront Events", country: "CA", countryName: "Canada" },
      { name: "Campus Dining Partners", country: "US", countryName: "United States" },
      { name: "Stadium Concessions Group", country: "US", countryName: "United States" },
      { name: "Green Table Meal Kits", country: "GB", countryName: "United Kingdom" },
      { name: "Airport Food Hall Collective", country: "US", countryName: "United States" },
      { name: "Union Hospital Nutrition", country: "US", countryName: "United States" },
      { name: "Cedar School Lunch Network", country: "US", countryName: "United States" },
      { name: "Tasting Room Hospitality", country: "AU", countryName: "Australia" },
      { name: "Northern Lights Catering", country: "NO", countryName: "Norway" },
      { name: "Festival Street Vendors Guild", country: "NL", countryName: "Netherlands" },
    ],
    campaigns: [
      { id: "camp-fall", name: "Fall Comfort Favorites", status: "Active", channels: ["email"] },
      {
        id: "camp-winter",
        name: "Winter Warm-Up Menu",
        status: "Active",
        channels: ["email", "mobile-app"],
      },
      { id: "camp-spring", name: "Spring Fresh Bowls", status: "Planned", channels: ["email"] },
      {
        id: "camp-holiday",
        name: "Holiday Catering Orders",
        status: "Planned",
        channels: ["email", "sms"],
      },
      {
        id: "camp-summer",
        name: "Summer Cooler Drinks",
        status: "Completed",
        channels: ["mobile-app"],
      },
    ],
    contentKinds: ["Hero email", "Menu landing page", "Catering webinar invite"],
    brandRules: [
      "Accessible alt text",
      "Warm, sunny tone",
      "No unapproved claims",
      "Consent language present",
      "At most one emoji",
      "Allergen notice present",
    ],
  },
  useCases: [...CORE_USE_CASES, "weather-aware-campaign", "service-weather", "weather-inventory"],
  promptContext:
    "The client operates restaurants. Sales follow the daypart and the weather, app push is the main channel, and stock-outs and allergen claims are the main risks.",
  sample: {
    brandVoice:
      "Warm, sunny, and a little playful. Short sentences, no ALL CAPS, at most one emoji.",
    customerSegments: ["App users by location", "Loyalty members", "Catering buyers"],
    products: ["Bowls", "Burritos", "Drinks"],
    compliance: [
      "Allergen disclosure",
      "Offers capped at 20% off",
      "No alcohol in late-night messages",
    ],
  },
};
