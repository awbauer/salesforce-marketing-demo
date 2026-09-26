/**
 * Deterministic, fictional knowledge-graph dataset for the Northstar demo. Every name, figure,
 * and relationship is invented; personas are buying roles, not people, and engagement is
 * aggregated. The same generator feeds the Aura seed script and the local fixture backend.
 *
 * Northstar is the parent brand; Coastline Kitchen is a restaurant brand under it. Coastline's
 * locations, menu, and app audiences come from the restaurant system (coastline.ts), and its
 * push campaigns run on the mobile app channel with the same consent, content, and segment
 * structure as every other campaign.
 */
import {
  COASTLINE,
  COASTLINE_LOCATIONS,
  COASTLINE_MENU,
  DAYPART_HOURS,
  DAYPARTS,
  locationNodeId,
  menuItemId,
  NORTHSTAR_BRAND,
  slug,
} from "./coastline.ts";

export const DATASET_VERSION = "northstar-kg-v2";

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
  {
    id: "camp-winter",
    name: "Winter Gear Launch",
    status: "Active",
    channels: ["email", "mobile-app"],
  },
  { id: "camp-spring", name: "Spring Trail Series", status: "Planned", channels: ["email"] },
  { id: "camp-holiday", name: "Holiday Gift Guide", status: "Planned", channels: ["email", "sms"] },
  {
    id: "camp-summer",
    name: "Summer Hydration Push",
    status: "Completed",
    channels: ["mobile-app"],
  },
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

export const CHANNELS = ["email", "sms", "mobile-app"] as const;
const CHANNEL_NAMES: Record<(typeof CHANNELS)[number], string> = {
  email: "Email",
  sms: "SMS",
  "mobile-app": "Mobile app",
};
const CONSENT_IDS: Record<(typeof CHANNELS)[number], string> = {
  email: "consent-email-marketing",
  sms: "consent-sms-marketing",
  "mobile-app": "consent-push-marketing",
};
export const consentScopeFor = (channel: (typeof CHANNELS)[number]) => CONSENT_IDS[channel];

export const LOCATIONS = COASTLINE_LOCATIONS.map((location) => ({
  id: location.id,
  name: `${COASTLINE.name} ${location.city}`,
}));

/** Campaign-relevant weather buckets; "heat" means feels-like of 85°F or more. */
export const CONDITIONS = ["clear", "cloudy", "fog", "rain", "heat"] as const;

const ANGLES = {
  heat: "Beat the heat",
  rain: "Rainy-day comfort",
  fog: "Foggy-day warm-up",
  clear: "Perfect weather treat",
  cloudy: "Everyday favorite",
  late: "Late-night craving",
  morning: "Morning fuel",
} as const;
type AngleKey = keyof typeof ANGLES;

/** Coastline's push campaigns on the mobile app channel, and the message angles each owns. */
export const COASTLINE_CAMPAIGNS = [
  {
    id: "camp-coastline-weather",
    name: "Coastline Weather Moments",
    status: "Active",
    angles: ["heat", "rain", "fog", "clear", "cloudy"] as AngleKey[],
  },
  {
    id: "camp-coastline-mornings",
    name: "Coastline Morning Fuel",
    status: "Active",
    angles: ["morning"] as AngleKey[],
  },
  {
    id: "camp-coastline-late-night",
    name: "Coastline Late-Night Cravings",
    status: "Active",
    angles: ["late"] as AngleKey[],
  },
] as const;

export const ALL_CAMPAIGNS = [
  ...CAMPAIGNS.map((campaign) => ({
    id: campaign.id,
    name: campaign.name,
    status: campaign.status,
  })),
  ...COASTLINE_CAMPAIGNS.map((campaign) => ({
    id: campaign.id,
    name: campaign.name,
    status: campaign.status,
  })),
];

export const coastlineSegmentId = (location: string) => `segment-coastline-${location}`;

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

  // Brands: Coastline Kitchen is a brand under Northstar.
  node("Brand", NORTHSTAR_BRAND.id, NORTHSTAR_BRAND.name, { kind: "parent brand" });
  node("Brand", COASTLINE.id, COASTLINE.name, {
    kind: "restaurant brand",
    concept: COASTLINE.concept,
    hours: COASTLINE.hours,
    voice: COASTLINE.brandVoice,
    restaurantId: COASTLINE.restaurantId,
  });
  rel("PART_OF", COASTLINE.id, NORTHSTAR_BRAND.id);

  // Channels and the marketing consent each requires.
  for (const channel of CHANNELS) {
    node("Channel", `channel-${channel}`, CHANNEL_NAMES[channel], {
      channelId: channel,
      ...(channel === "mobile-app" ? { delivers: "push notifications" } : {}),
    });
    const scope = node(
      "ConsentScope",
      CONSENT_IDS[channel],
      channel === "mobile-app" ? "push marketing" : `${channel} marketing`,
      { channel, purpose: "marketing" },
    );
    rel("FOR", scope, `channel-${channel}`);
  }
  node("ConsentScope", "consent-email-transactional", "email transactional", {
    channel: "email",
    purpose: "transactional",
  });
  rel("FOR", "consent-email-transactional", "channel-email");

  const ruleIds = BRAND_RULES.map((rule) => {
    const id = node("BrandRule", `rule-${slug(rule)}`, rule);
    rel("RULE_OF", id, NORTHSTAR_BRAND.id);
    return id;
  });
  const coastlineRuleIds = COASTLINE.promotionRules.map((rule) => {
    const id = node("BrandRule", `rule-${slug(rule)}`, rule);
    rel("RULE_OF", id, COASTLINE.id);
    return id;
  });

  const assetsByCampaign = new Map<string, string[]>();
  for (const campaign of CAMPAIGNS) {
    node("Campaign", campaign.id, campaign.name, {
      status: campaign.status,
      ...("salesforceId" in campaign ? { salesforceId: campaign.salesforceId } : {}),
    });
    rel("BELONGS_TO", campaign.id, NORTHSTAR_BRAND.id);
    for (const channel of campaign.channels) rel("ON", campaign.id, `channel-${channel}`);
    const brief = node("Brief", `brief-${campaign.id}`, `${campaign.name} brief`);
    rel("FOR", brief, campaign.id);
    const assets = CONTENT_KINDS.map((kind) => {
      const asset = node(
        "ContentAsset",
        `asset-${campaign.id}-${slug(kind)}`,
        `${campaign.name} · ${kind}`,
        { kind },
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

  // Coastline Kitchen's own entities: locations, its menu, menu items, and dayparts.
  for (const daypart of DAYPARTS)
    node("Daypart", `daypart-${daypart}`, daypart, { hours: DAYPART_HOURS[daypart] });
  for (const condition of CONDITIONS) node("WeatherCondition", `weather-${condition}`, condition);
  node("Menu", COASTLINE.menu.id, COASTLINE.menu.name);
  rel("MENU_OF", COASTLINE.menu.id, COASTLINE.id);
  const menuIds = COASTLINE_MENU.map((item) => {
    const id = node("MenuItem", menuItemId(item.name), item.name, {
      serves: item.serves,
      price: item.price,
      tags: [...item.tags],
    });
    rel("ON_MENU", id, COASTLINE.menu.id);
    for (const daypart of item.dayparts) rel("AVAILABLE_DURING", id, `daypart-${daypart}`);
    return id;
  });
  for (const [rank, favorite] of COASTLINE.favorites.entries())
    rel("FAVORITE", COASTLINE.id, menuItemId(favorite.item), {
      note: favorite.note,
      rank: rank + 1,
    });

  // Each location has an app audience segment with aggregate push consent (no individuals).
  for (const location of COASTLINE_LOCATIONS) {
    const locationId = node(
      "Location",
      locationNodeId(location.id),
      `${COASTLINE.name} ${location.city}`,
      {
        city: location.city,
        weatherLocation: location.id,
        neighborhood: location.neighborhood,
        address: location.address,
        hours: COASTLINE.hours,
      },
    );
    rel("OPERATES", COASTLINE.id, locationId);
    rel("SERVES", locationId, COASTLINE.menu.id);
    const segment = node(
      "Segment",
      coastlineSegmentId(location.id),
      `Coastline app · ${location.city}`,
      {
        size: location.appUsers,
        audienceType: "app users",
      },
    );
    rel("NEAR", segment, locationId);
    rel("HAS_CONSENT", segment, CONSENT_IDS["mobile-app"], {
      optedIn: location.pushOptIns,
      coverageRate: Math.round((location.pushOptIns / location.appUsers) * 1000) / 1000,
    });
  }

  // Coastline's push campaigns: brief, push content per angle, location segments, mobile app.
  const assetByAngle = new Map<AngleKey, { campaign: string; asset: string }>();
  for (const campaign of COASTLINE_CAMPAIGNS) {
    node("Campaign", campaign.id, campaign.name, { status: campaign.status });
    rel("BELONGS_TO", campaign.id, COASTLINE.id);
    rel("ON", campaign.id, "channel-mobile-app");
    const brief = node("Brief", `brief-${campaign.id}`, `${campaign.name} brief`);
    rel("FOR", brief, campaign.id);
    for (const location of COASTLINE_LOCATIONS)
      rel("TARGETS", campaign.id, coastlineSegmentId(location.id));
    for (const angle of campaign.angles) {
      const asset = node(
        "ContentAsset",
        `asset-${campaign.id}-${slug(ANGLES[angle])}`,
        `${ANGLES[angle]} · push`,
        { kind: "Push notification", angle: ANGLES[angle] },
      );
      rel("USES", campaign.id, asset);
      rel("BUILT_FROM", asset, brief);
      for (const ruleId of [...coastlineRuleIds, "rule-at-most-one-emoji"])
        rel(rand() < 0.1 ? "FAILED" : "PASSED", asset, ruleId);
      assetByAngle.set(angle, { campaign: campaign.id, asset });
    }
  }

  // Fictional push history: order rates rise when the item suits the weather and daypart.
  for (let index = 0; index < 1500; index += 1) {
    const location = pick(COASTLINE_LOCATIONS).id;
    const daypart = pick(DAYPARTS);
    const condition = pick(CONDITIONS);
    const itemIndex = Math.floor(rand() * COASTLINE_MENU.length);
    const item = COASTLINE_MENU[itemIndex] as (typeof COASTLINE_MENU)[number];
    let lift = item.dayparts.includes(daypart) ? 0.02 : -0.01;
    if (condition === "heat")
      lift += item.serves === "cold" ? 0.03 : item.serves === "hot" ? -0.015 : 0;
    if (condition === "rain" || condition === "fog")
      lift += item.serves === "hot" ? 0.025 : item.serves === "cold" ? -0.015 : 0;
    const orderRate = Math.max(0.005, 0.03 + lift + (rand() - 0.5) * 0.02);
    const openRate = Math.max(0.02, 0.07 + lift * 0.8 + (rand() - 0.5) * 0.03);
    const angleKey: AngleKey =
      daypart === "late-night"
        ? "late"
        : daypart === "early-morning" || daypart === "breakfast"
          ? "morning"
          : condition;
    const angle = ANGLES[angleKey];
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
    const content = assetByAngle.get(angleKey) as { campaign: string; asset: string };
    rel("PART_OF", push, content.campaign);
    rel("USED", push, content.asset);
    rel("SENT_TO", push, coastlineSegmentId(location));
    rel("ON", push, "channel-mobile-app");
    rel("SENT_UNDER", push, CONSENT_IDS["mobile-app"]);
    rel("FEATURED", push, menuIds[itemIndex] as string);
    rel("FOR", push, locationNodeId(location));
    rel("SENT_DURING", push, `daypart-${daypart}`);
    rel("UNDER", push, `weather-${condition}`);
  }
  return { nodes, relationships };
}
