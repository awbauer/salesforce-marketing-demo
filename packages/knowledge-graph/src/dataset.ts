/**
 * Deterministic, fictional knowledge-graph dataset for the Northstar demo. Every name, figure,
 * and relationship is invented; personas are buying roles, not people, and engagement is
 * aggregated. The same generator feeds the Aura seed script and the local fixture backend.
 */

export const DATASET_VERSION = "northstar-kg-v1";

export type GraphNode = { id: string; label: string; name: string; [key: string]: unknown };
export type GraphRelationship = {
  type: string;
  from: string;
  to: string;
  properties?: Record<string, number | string>;
};
export type Dataset = { nodes: GraphNode[]; relationships: GraphRelationship[] };

function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const slug = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export const ACCOUNTS = [
  "Acme Outfitters",
  "Summit Trail Co.",
  "Redwood Rangers Club",
  "Harbor Point Sports",
  "Blue Ridge Adventures",
  "Pacific Crest Supply",
  "Granite Peak Gear",
  "Riverbend Outdoor",
  "Northwind Expeditions",
  "Cedar Hollow Camps",
  "Silverline Cycling",
  "Lakeside Paddle Co.",
] as const;

const ROLES = [
  { role: "Economic buyer", weight: 5 },
  { role: "Champion", weight: 6 },
  { role: "Marketing lead", weight: 4 },
  { role: "Operations manager", weight: 3 },
  { role: "Procurement", weight: 2 },
  { role: "Technical evaluator", weight: 3 },
] as const;

export const CAMPAIGNS = [
  {
    id: "camp-fall",
    name: "Fall Loyalty Reactivation",
    salesforceId: "701jV000004GglIQAS",
    status: "Active",
    channels: ["email"],
  },
  { id: "camp-winter", name: "Winter Gear Launch", status: "Active", channels: ["email", "push"] },
  { id: "camp-spring", name: "Spring Trail Series", status: "Planned", channels: ["email"] },
  { id: "camp-holiday", name: "Holiday Gift Guide", status: "Planned", channels: ["email", "sms"] },
  { id: "camp-summer", name: "Summer Hydration Push", status: "Completed", channels: ["push"] },
] as const;

const CONTENT_KINDS = ["Hero email", "Landing page", "Webinar invite"] as const;

const BRAND_RULES = [
  "Accessible alt text",
  "Warm, plain tone",
  "No unapproved claims",
  "Consent language present",
  "At most one emoji",
  "Legal footer",
] as const;

export const CHANNELS = ["email", "sms", "push"] as const;

export const LOCATIONS = [
  { id: "los-angeles", name: "Coastline Kitchen Los Angeles" },
  { id: "san-francisco", name: "Coastline Kitchen San Francisco" },
  { id: "san-diego", name: "Coastline Kitchen San Diego" },
  { id: "sacramento", name: "Coastline Kitchen Sacramento" },
  { id: "fresno", name: "Coastline Kitchen Fresno" },
] as const;

export const DAYPARTS = [
  "early-morning",
  "breakfast",
  "lunch",
  "afternoon",
  "dinner",
  "late-night",
] as const;

/** Campaign-relevant weather buckets; "heat" means feels-like of 85°F or more. */
export const CONDITIONS = ["clear", "cloudy", "fog", "rain", "heat"] as const;

type Serves = "hot" | "cold" | "warm";
const MENU: Array<{ name: string; serves: Serves; dayparts: (typeof DAYPARTS)[number][] }> = [
  {
    name: "Chile Verde Breakfast Burrito",
    serves: "hot",
    dayparts: ["early-morning", "breakfast"],
  },
  { name: "Açaí Sunrise Bowl", serves: "cold", dayparts: ["breakfast", "lunch", "afternoon"] },
  {
    name: "Horchata Cold Brew",
    serves: "cold",
    dayparts: ["early-morning", "breakfast", "afternoon"],
  },
  { name: "Citrus Chicken Grain Bowl", serves: "warm", dayparts: ["lunch", "dinner"] },
  { name: "Baja Fish Tacos", serves: "warm", dayparts: ["lunch", "afternoon", "dinner"] },
  { name: "Spicy Tortilla Soup", serves: "hot", dayparts: ["lunch", "dinner", "late-night"] },
  { name: "Garlic Noodle Bowl", serves: "hot", dayparts: ["dinner", "late-night"] },
  { name: "Carne Asada Fries", serves: "hot", dayparts: ["dinner", "late-night"] },
  {
    name: "Watermelon Mint Agua Fresca",
    serves: "cold",
    dayparts: ["breakfast", "lunch", "afternoon", "dinner"],
  },
  { name: "Mango Chili Smoothie", serves: "cold", dayparts: ["afternoon", "late-night"] },
];

const ANGLES = {
  heat: "Beat the heat",
  rain: "Rainy-day comfort",
  fog: "Foggy-day warm-up",
  clear: "Perfect weather treat",
  cloudy: "Everyday favorite",
  late: "Late-night craving",
  morning: "Morning fuel",
} as const;

export function buildDataset(seed = 20260926): Dataset {
  const rand = random(seed);
  const pick = <T>(items: readonly T[]) => items[Math.floor(rand() * items.length)] as T;
  const nodes: GraphNode[] = [];
  const relationships: GraphRelationship[] = [];
  const node = (label: string, id: string, name: string, extra: Record<string, unknown> = {}) => {
    nodes.push({ id, label, name, ...extra });
    return id;
  };
  const rel = (
    type: string,
    from: string,
    to: string,
    properties?: GraphRelationship["properties"],
  ) => relationships.push({ type, from, to, ...(properties ? { properties } : {}) });

  for (const channel of CHANNELS) node("Channel", `channel-${channel}`, channel);
  for (const channel of CHANNELS) {
    const scope = node("ConsentScope", `consent-${channel}-marketing`, `${channel} marketing`, {
      channel,
      purpose: "marketing",
    });
    rel("FOR", scope, `channel-${channel}`);
  }
  node("ConsentScope", "consent-email-transactional", "email transactional", {
    channel: "email",
    purpose: "transactional",
  });
  rel("FOR", "consent-email-transactional", "channel-email");
  const ruleIds = BRAND_RULES.map((rule) => node("BrandRule", `rule-${slug(rule)}`, rule));

  const assetsByCampaign = new Map<string, string[]>();
  for (const campaign of CAMPAIGNS) {
    node("Campaign", campaign.id, campaign.name, {
      status: campaign.status,
      ...("salesforceId" in campaign ? { salesforceId: campaign.salesforceId } : {}),
    });
    for (const channel of campaign.channels) rel("ON", campaign.id, `channel-${channel}`);
    const brief = node("Brief", `brief-${campaign.id}`, `${campaign.name} brief`);
    rel("FOR", brief, campaign.id);
    const assets = CONTENT_KINDS.map((kind) => {
      const asset = node(
        "ContentAsset",
        `asset-${campaign.id}-${slug(kind)}`,
        `${campaign.name} · ${kind}`,
        {
          kind,
        },
      );
      rel("USES", campaign.id, asset);
      rel("BUILT_FROM", asset, brief);
      for (const [index, ruleId] of ruleIds.entries()) {
        if ((index + CONTENT_KINDS.indexOf(kind)) % 2 === 1) continue;
        // The fall hero email fails alt text, matching the readiness blocker in the demo.
        const failed =
          (campaign.id === "camp-fall" &&
            kind === "Hero email" &&
            ruleId === "rule-accessible-alt-text") ||
          rand() < 0.08;
        rel(failed ? "FAILED" : "PASSED", asset, ruleId);
      }
      return asset;
    });
    assetsByCampaign.set(campaign.id, assets);
    node("Segment", `segment-${campaign.id}`, `${campaign.name} audience`);
    rel("TARGETS", campaign.id, `segment-${campaign.id}`);
  }

  for (const [accountIndex, account] of ACCOUNTS.entries()) {
    const accountId = node("Account", `acct-${String(accountIndex + 1).padStart(2, "0")}`, account);
    const roles = ROLES.filter(() => rand() < 0.75);
    for (const { role, weight } of roles.length >= 3 ? roles : ROLES.slice(0, 3)) {
      const persona = node("Persona", `${accountId}-${slug(role)}`, `${account} · ${role}`, {
        role,
        roleWeight: weight,
      });
      rel("WORKS_AT", persona, accountId);
      for (const campaign of CAMPAIGNS) {
        if (rand() < 0.45) rel("INCLUDES", `segment-${campaign.id}`, persona);
        for (const asset of assetsByCampaign.get(campaign.id) ?? [])
          if (rand() < 0.22)
            rel("ENGAGED_WITH", persona, asset, {
              count: 1 + Math.floor(rand() * 6),
              lastDaysAgo: 1 + Math.floor(rand() * 60),
            });
      }
      if (rand() < 0.7) rel("HAS_CONSENT", persona, "consent-email-marketing");
      if (rand() < 0.4) rel("HAS_CONSENT", persona, "consent-sms-marketing");
      if (rand() < 0.5) rel("HAS_CONSENT", persona, "consent-push-marketing");
      rel("HAS_CONSENT", persona, "consent-email-transactional");
    }
  }

  node("Restaurant", "restaurant-coastline-kitchen", "Coastline Kitchen");
  for (const location of LOCATIONS) {
    node("Location", `location-${location.id}`, location.name, { city: location.id });
    rel("PART_OF", `location-${location.id}`, "restaurant-coastline-kitchen");
  }
  for (const daypart of DAYPARTS) node("Daypart", `daypart-${daypart}`, daypart);
  for (const condition of CONDITIONS) node("WeatherCondition", `weather-${condition}`, condition);
  const menuIds = MENU.map((item) =>
    node("MenuItem", `menu-${slug(item.name)}`, item.name, { serves: item.serves }),
  );

  // Fictional push history: order rates rise when the item suits the weather and daypart.
  for (let index = 0; index < 1500; index += 1) {
    const location = pick(LOCATIONS).id;
    const daypart = pick(DAYPARTS);
    const condition = pick(CONDITIONS);
    const itemIndex = Math.floor(rand() * MENU.length);
    const item = MENU[itemIndex] as (typeof MENU)[number];
    let lift = item.dayparts.includes(daypart) ? 0.02 : -0.01;
    if (condition === "heat")
      lift += item.serves === "cold" ? 0.03 : item.serves === "hot" ? -0.015 : 0;
    if (condition === "rain" || condition === "fog")
      lift += item.serves === "hot" ? 0.025 : item.serves === "cold" ? -0.015 : 0;
    const orderRate = Math.max(0.005, 0.03 + lift + (rand() - 0.5) * 0.02);
    const openRate = Math.max(0.02, 0.07 + lift * 0.8 + (rand() - 0.5) * 0.03);
    const angle =
      daypart === "late-night"
        ? ANGLES.late
        : daypart === "early-morning" || daypart === "breakfast"
          ? ANGLES.morning
          : ANGLES[condition];
    const push = node(
      "PushSend",
      `push-${String(index + 1).padStart(4, "0")}`,
      `${angle}: ${item.name}`,
      {
        angle,
        orderRate: Math.round(orderRate * 10000) / 10000,
        openRate: Math.round(openRate * 10000) / 10000,
      },
    );
    rel("FEATURED", push, menuIds[itemIndex] as string);
    rel("FOR", push, `location-${location}`);
    rel("SENT_DURING", push, `daypart-${daypart}`);
    rel("UNDER", push, `weather-${condition}`);
  }
  return { nodes, relationships };
}
