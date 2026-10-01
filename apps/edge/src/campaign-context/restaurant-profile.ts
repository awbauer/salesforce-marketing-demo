import {
  DAYPART_HOURS,
  locationNodeId,
  menuItemId,
  RESTAURANT,
  RESTAURANT_LOCATIONS,
  RESTAURANT_MENU,
} from "../../../../packages/knowledge-graph/src/restaurant.ts";

/**
 * The restaurant system's view of Sample Kitchen, a fictional brand under Workbench. It keeps
 * its own entities (brand, locations, menu, dayparts, app audience) and shares their ids with
 * the knowledge graph, so a location or menu item here is the same node there. All names and
 * figures are invented; audience facts are aggregates with no customer records.
 */
const flagship = RESTAURANT_LOCATIONS[0];

export const RESTAURANT_PROFILES = {
  [RESTAURANT.restaurantId]: {
    id: RESTAURANT.restaurantId,
    graphId: RESTAURANT.id,
    name: RESTAURANT.name,
    parentBrand: RESTAURANT.parentBrand.name,
    concept: RESTAURANT.concept,
    hours: RESTAURANT.hours,
    /** The flagship; its id is the weather-tool city id. */
    location: {
      id: flagship.id,
      graphId: locationNodeId(flagship.id),
      city: flagship.city,
      neighborhood: flagship.neighborhood,
      address: flagship.address,
      service: [...RESTAURANT.services],
    },
    locations: RESTAURANT_LOCATIONS.map((location) => ({
      id: location.id,
      graphId: locationNodeId(location.id),
      city: location.city,
      neighborhood: location.neighborhood,
      appUsers: location.appUsers,
      // Marketing consent is per channel: an email campaign counts email opt-ins, not push.
      optIns: {
        push: location.pushOptIns,
        email: location.emailOptIns,
        sms: location.smsOptIns,
      },
    })),
    brandVoice: RESTAURANT.brandVoice,
    menuId: RESTAURANT.menu.id,
    menu: RESTAURANT_MENU.map((item) => ({
      id: menuItemId(item.name),
      item: item.name,
      price: item.price,
      dayparts: item.dayparts.map((daypart) => daypart.replace("-", " ")),
      serves: item.serves,
      tags: [...item.tags],
    })),
    favorites: RESTAURANT.favorites.map((favorite) => ({
      ...favorite,
      id: menuItemId(favorite.item),
    })),
    dayparts: Object.fromEntries(
      Object.entries(DAYPART_HOURS).map(([daypart, hours]) => [daypart.replace("-", " "), hours]),
    ),
    audience: {
      appUsers: RESTAURANT_LOCATIONS.reduce((sum, location) => sum + location.appUsers, 0),
      marketingOptInsByChannel: {
        push: RESTAURANT_LOCATIONS.reduce((sum, location) => sum + location.pushOptIns, 0),
        email: RESTAURANT_LOCATIONS.reduce((sum, location) => sum + location.emailOptIns, 0),
        sms: RESTAURANT_LOCATIONS.reduce((sum, location) => sum + location.smsOptIns, 0),
      },
      consentRule:
        "Count only the opt-ins for the campaign's channel: push opt-ins for a push, email opt-ins for an email, SMS opt-ins for a text.",
      pushOpenRate: RESTAURANT.pushOpenRate,
      busiestDayparts: RESTAURANT.busiestDayparts.map((daypart) => daypart.replace("-", " ")),
      note: "Aggregate, fictional figures. No individual customer data.",
    },
    promotionRules: [
      "Draft only; campaigns are never scheduled or sent from this tool.",
      ...RESTAURANT.promotionRules,
    ],
  },
} as const;

export type RestaurantId = keyof typeof RESTAURANT_PROFILES;
export const RESTAURANT_IDS = Object.keys(RESTAURANT_PROFILES) as [RestaurantId, ...RestaurantId[]];
