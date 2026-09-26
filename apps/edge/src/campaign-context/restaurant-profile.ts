import {
  COASTLINE,
  COASTLINE_LOCATIONS,
  COASTLINE_MENU,
  DAYPART_HOURS,
  locationNodeId,
  menuItemId,
} from "../../../../packages/knowledge-graph/src/coastline.ts";

/**
 * The restaurant system's view of Coastline Kitchen, a fictional brand under Northstar. It keeps
 * its own entities (brand, locations, menu, dayparts, app audience) and shares their ids with
 * the knowledge graph, so a location or menu item here is the same node there. All names and
 * figures are invented; audience facts are aggregates with no customer records.
 */
const flagship = COASTLINE_LOCATIONS[0];

export const RESTAURANT_PROFILES = {
  [COASTLINE.restaurantId]: {
    id: COASTLINE.restaurantId,
    graphId: COASTLINE.id,
    name: COASTLINE.name,
    parentBrand: COASTLINE.parentBrand.name,
    concept: COASTLINE.concept,
    hours: COASTLINE.hours,
    /** The flagship; its id is the weather-tool city id. */
    location: {
      id: flagship.id,
      graphId: locationNodeId(flagship.id),
      city: flagship.city,
      neighborhood: flagship.neighborhood,
      address: flagship.address,
      service: [...COASTLINE.services],
    },
    locations: COASTLINE_LOCATIONS.map((location) => ({
      id: location.id,
      graphId: locationNodeId(location.id),
      city: location.city,
      neighborhood: location.neighborhood,
      appUsers: location.appUsers,
      pushOptIns: location.pushOptIns,
    })),
    brandVoice: COASTLINE.brandVoice,
    menuId: COASTLINE.menu.id,
    menu: COASTLINE_MENU.map((item) => ({
      id: menuItemId(item.name),
      item: item.name,
      price: item.price,
      dayparts: item.dayparts.map((daypart) => daypart.replace("-", " ")),
      serves: item.serves,
      tags: [...item.tags],
    })),
    favorites: COASTLINE.favorites.map((favorite) => ({
      ...favorite,
      id: menuItemId(favorite.item),
    })),
    dayparts: Object.fromEntries(
      Object.entries(DAYPART_HOURS).map(([daypart, hours]) => [daypart.replace("-", " "), hours]),
    ),
    audience: {
      channel: "mobile app (push notifications)",
      appUsers: COASTLINE_LOCATIONS.reduce((sum, location) => sum + location.appUsers, 0),
      appUsersWithPushEnabled: COASTLINE_LOCATIONS.reduce(
        (sum, location) => sum + location.pushOptIns,
        0,
      ),
      pushOpenRate: COASTLINE.pushOpenRate,
      busiestDayparts: COASTLINE.busiestDayparts.map((daypart) => daypart.replace("-", " ")),
      note: "Aggregate, fictional figures. No individual customer data.",
    },
    promotionRules: [
      "Draft only; campaigns are never scheduled or sent from this tool.",
      ...COASTLINE.promotionRules,
    ],
  },
} as const;

export type RestaurantId = keyof typeof RESTAURANT_PROFILES;
export const RESTAURANT_IDS = Object.keys(RESTAURANT_PROFILES) as [RestaurantId, ...RestaurantId[]];
