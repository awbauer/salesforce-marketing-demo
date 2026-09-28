/**
 * Harborstone Wealth: a fictional wealth-management brand under Northstar, for the financial
 * services use cases. Everything here is invented. Regulated content is only released when it is
 * pre-approved: each asset carries its approval record, the disclosures it must ship with, and
 * the channels it is approved for. Clients are institutions and family offices, never people.
 */

export const HARBORSTONE = {
  id: "brand-harborstone",
  name: "Harborstone Wealth",
  voice:
    "Calm, plain-spoken, and fiduciary: explain what a change means for the client, never predict markets or promise returns.",
} as const;

/** Compliance rules every Harborstone asset is checked against before a principal approves it. */
export const HARBORSTONE_RULES = [
  "Fair and balanced (FINRA 2210)",
  "No performance guarantees",
  "Required disclosures present",
] as const;

export const DISCLOSURES = {
  "investment-risk": {
    name: "Investment risk",
    text: "Investing involves risk, including possible loss of principal.",
  },
  "not-fdic": {
    name: "Not FDIC insured",
    text: "Not FDIC insured. No bank guarantee. May lose value.",
  },
  "past-performance": {
    name: "Past performance",
    text: "Past performance does not guarantee future results.",
  },
  "forward-looking": {
    name: "Forward-looking statements",
    text: "Forward-looking statements are subject to risks and uncertainties.",
  },
  "closing-conditions": {
    name: "Closing conditions",
    text: "The transaction is subject to regulatory approval and customary closing conditions.",
  },
  "tax-legal": {
    name: "Tax and legal advice",
    text: "Harborstone does not provide tax or legal advice.",
  },
} as const;
export type DisclosureKey = keyof typeof DISCLOSURES;
export const disclosureId = (key: DisclosureKey) => `disclosure-${key}`;

/** Market events Harborstone prepares approved responses for ahead of time. */
export const MARKET_EVENTS = {
  "rate-increase": "Fed raises rates",
  "rate-cut": "Fed cuts rates",
  "rate-hold": "Fed holds rates",
  "market-volatility": "Market volatility",
} as const;
export type MarketEvent = keyof typeof MARKET_EVENTS;
export const MARKET_EVENT_IDS = Object.keys(MARKET_EVENTS) as [MarketEvent, ...MarketEvent[]];
export const marketEventId = (event: MarketEvent) => `event-${event}`;

export const PRODUCTS = {
  "managed-portfolio": "Managed portfolio",
  ocio: "Outsourced CIO",
  "muni-ladder": "Municipal bond ladder",
  "cash-management": "Cash management",
  "private-credit": "Private credit fund",
  daf: "Donor-advised fund",
  "trust-services": "Trust and estate services",
  "retirement-plan": "Retirement plan services",
  "securities-lending": "Securities-based lending",
} as const;
export type ProductKey = keyof typeof PRODUCTS;
export const productId = (key: ProductKey) => `product-${key}`;

/** Signals the relationship team watches, and the products each one points to. */
export const SIGNALS = {
  "held-away": {
    name: "Assets held at another custodian",
    suggests: [
      ["managed-portfolio", 0.3, "Consolidate held-away assets into one managed plan"],
      ["ocio", 0.25, "Bring the outside pool under one investment committee process"],
    ],
  },
  "liquidity-event": {
    name: "Liquidity event (business sale)",
    suggests: [
      ["managed-portfolio", 0.35, "Invest sale proceeds under a written plan"],
      ["trust-services", 0.15, "Structure proceeds for heirs before the next tax year"],
      ["daf", 0.1, "Pre-fund giving in the year of the sale"],
    ],
  },
  "excess-cash": {
    name: "Cash above operating target",
    suggests: [
      ["cash-management", 0.2, "Move idle operating cash into a tiered cash program"],
      ["muni-ladder", 0.15, "Ladder reserve cash for predictable, tax-aware income"],
    ],
  },
  "spending-policy": {
    name: "Spending policy review",
    suggests: [
      ["ocio", 0.2, "Align the portfolio with the new spending policy"],
      ["private-credit", 0.08, "Add income to meet a higher payout"],
    ],
  },
  "plan-review": {
    name: "Retirement plan provider review",
    suggests: [["retirement-plan", 0.4, "Win the plan during the provider review"]],
  },
  "next-gen": {
    name: "Next-generation transfer planning",
    suggests: [
      ["trust-services", 0.2, "Set up trusts before assets pass to the next generation"],
      ["daf", 0.08, "Give the next generation a role in family giving"],
    ],
  },
  "rate-sensitivity": {
    name: "Rate-sensitive balance sheet",
    suggests: [
      ["muni-ladder", 0.12, "Lock in yield while rates are higher"],
      ["cash-management", 0.1, "Reprice idle cash after the rate move"],
      ["securities-lending", 0.05, "Borrow against the portfolio instead of selling"],
    ],
  },
} as const satisfies Record<
  string,
  { name: string; suggests: ReadonlyArray<readonly [ProductKey, number, string]> }
>;
export type SignalKey = keyof typeof SIGNALS;
export const signalId = (key: SignalKey) => `signal-${key}`;

export type ApprovalStatus = "Approved" | "Expired" | "Pending";
export type Approval = {
  id: string;
  status: ApprovalStatus;
  approvedOn?: string;
  expiresOn?: string;
  /** Approved now, released only when the event it's for is announced. */
  embargoed?: boolean;
};
export const approvalNodeId = (approval: string) => `approval-${approval.toLowerCase()}`;

type Channel = "email" | "sms";
export type LibraryAsset = {
  id: string;
  name: string;
  kind: string;
  channel: Channel | null;
  approval: Approval;
  disclosures: DisclosureKey[];
  /** A rule the asset failed in review; failing any rule blocks release. */
  failed?: (typeof HARBORSTONE_RULES)[number];
  event?: MarketEvent;
  explains?: ProductKey[];
};

const approved = (id: string, approvedOn: string, expiresOn: string): Approval => ({
  id,
  status: "Approved",
  approvedOn,
  expiresOn,
});

/** Harborstone's rapid-response program: responses to market events, approved ahead of time. */
export const MARKET_MOMENTS_CAMPAIGN = {
  id: "camp-harborstone-market-moments",
  name: "Harborstone Market Moments",
  status: "Active",
} as const;

export const MARKET_ASSETS: LibraryAsset[] = [
  {
    id: "asset-hs-rates-rose-cash",
    name: "Rates rose: what it means for your cash",
    kind: "Email",
    channel: "email",
    event: "rate-increase",
    approval: approved("COMP-2026-0412", "2026-04-12", "2027-04-12"),
    disclosures: ["not-fdic", "investment-risk"],
    explains: ["cash-management"],
  },
  {
    id: "asset-hs-rates-rose-sms",
    name: "Rates rose: SMS heads-up",
    kind: "SMS",
    channel: "sms",
    event: "rate-increase",
    approval: approved("COMP-2026-0413", "2026-04-12", "2027-04-12"),
    disclosures: ["investment-risk"],
  },
  {
    id: "asset-hs-rates-rose-bond-ladder",
    name: "Rates rose: time to revisit your bond ladder",
    kind: "Email",
    channel: "email",
    event: "rate-increase",
    approval: {
      id: "COMP-2025-1107",
      status: "Expired",
      approvedOn: "2025-11-07",
      expiresOn: "2026-05-07",
    },
    disclosures: ["investment-risk", "past-performance"],
    explains: ["muni-ladder"],
  },
  {
    id: "asset-hs-higher-rates-higher-returns",
    name: "Higher rates, higher returns",
    kind: "Email",
    channel: "email",
    event: "rate-increase",
    approval: { id: "COMP-2026-0519", status: "Pending" },
    disclosures: ["investment-risk"],
    failed: "No performance guarantees",
  },
  {
    id: "asset-hs-rates-fell-income",
    name: "Rates fell: locking in income",
    kind: "Email",
    channel: "email",
    event: "rate-cut",
    approval: approved("COMP-2026-0415", "2026-04-12", "2027-04-12"),
    disclosures: ["investment-risk", "past-performance"],
    explains: ["muni-ladder"],
  },
  {
    id: "asset-hs-rates-fell-sms",
    name: "Rates fell: SMS heads-up",
    kind: "SMS",
    channel: "sms",
    event: "rate-cut",
    approval: approved("COMP-2026-0416", "2026-04-12", "2027-04-12"),
    disclosures: ["investment-risk"],
  },
  {
    id: "asset-hs-rates-fell-lending",
    name: "Rates fell: a good time to review borrowing",
    kind: "Email",
    channel: "email",
    event: "rate-cut",
    approval: approved("COMP-2026-0602", "2026-06-02", "2027-06-02"),
    disclosures: ["investment-risk", "tax-legal"],
    explains: ["securities-lending"],
  },
  {
    id: "asset-hs-rates-hold-course",
    name: "Rates on hold: staying the course",
    kind: "Email",
    channel: "email",
    event: "rate-hold",
    approval: approved("COMP-2026-0417", "2026-04-12", "2027-04-12"),
    disclosures: ["investment-risk"],
  },
  {
    id: "asset-hs-rates-hold-sms",
    name: "Rates on hold: SMS heads-up",
    kind: "SMS",
    channel: "sms",
    event: "rate-hold",
    approval: { id: "COMP-2026-0618", status: "Pending" },
    disclosures: ["investment-risk"],
  },
  {
    id: "asset-hs-volatility-stay-invested",
    name: "Staying invested through market swings",
    kind: "Email",
    channel: "email",
    event: "market-volatility",
    approval: approved("COMP-2026-0301", "2026-03-01", "2027-03-01"),
    disclosures: ["investment-risk", "past-performance"],
  },
  {
    id: "asset-hs-volatility-faq",
    name: "Market volatility FAQ",
    kind: "Email",
    channel: "email",
    event: "market-volatility",
    approval: {
      id: "COMP-2025-0915",
      status: "Expired",
      approvedOn: "2025-09-15",
      expiresOn: "2026-03-15",
    },
    disclosures: ["investment-risk"],
  },
];

/** Past rapid responses: how fast each went out after the news, and how clients responded. */
export const PAST_RESPONSES = [
  {
    id: "response-01",
    asset: "asset-hs-rates-rose-cash",
    event: "rate-increase",
    hoursAfterNews: 2,
    openRate: 0.46,
    clickRate: 0.081,
  },
  {
    id: "response-02",
    asset: "asset-hs-rates-rose-cash",
    event: "rate-increase",
    hoursAfterNews: 26,
    openRate: 0.29,
    clickRate: 0.034,
  },
  {
    id: "response-03",
    asset: "asset-hs-rates-rose-cash",
    event: "rate-increase",
    hoursAfterNews: 4,
    openRate: 0.43,
    clickRate: 0.071,
  },
  {
    id: "response-04",
    asset: "asset-hs-rates-hold-course",
    event: "rate-hold",
    hoursAfterNews: 3,
    openRate: 0.41,
    clickRate: 0.052,
  },
  {
    id: "response-05",
    asset: "asset-hs-volatility-stay-invested",
    event: "market-volatility",
    hoursAfterNews: 30,
    openRate: 0.24,
    clickRate: 0.021,
  },
  {
    id: "response-06",
    asset: "asset-hs-rates-fell-income",
    event: "rate-cut",
    hoursAfterNews: 5,
    openRate: 0.44,
    clickRate: 0.066,
  },
] as const;

/**
 * Harborstone's audiences, with aggregate consent per scope (no individuals). Bayview's clients
 * get service notices under their existing client agreement; Harborstone has no marketing
 * consent from them until they opt in.
 */
export const HARBORSTONE_SEGMENTS = [
  {
    id: "segment-harborstone-clients",
    name: "Harborstone clients",
    size: 48_200,
    audienceType: "clients",
    consent: [
      ["consent-email-marketing", 31_400],
      ["consent-email-transactional", 48_200],
      ["consent-sms-marketing", 9_800],
    ],
  },
  {
    id: "segment-harborstone-subscribers",
    name: "Harborstone Insights subscribers",
    size: 22_500,
    audienceType: "prospects",
    consent: [["consent-email-marketing", 22_500]],
  },
  {
    id: "segment-bayview-clients",
    name: "Bayview Retirement Advisors clients",
    size: 12_600,
    audienceType: "acquired clients",
    consent: [["consent-email-transactional", 12_600]],
  },
  {
    id: "segment-harborstone-advisors",
    name: "Harborstone advisors",
    size: 340,
    audienceType: "internal",
    consent: [],
  },
] as const;
export type HarborstoneSegmentId = (typeof HARBORSTONE_SEGMENTS)[number]["id"];

export const DEAL = {
  id: "deal-bayview",
  name: "Harborstone to acquire Bayview Retirement Advisors",
  status: "Signed; announcement embargoed",
  firm: { id: "firm-bayview", name: "Bayview Retirement Advisors", clients: 12_600 },
  campaign: { id: "camp-harborstone-bayview", name: "Bayview Welcome", status: "Embargoed" },
} as const;
export const DEAL_IDS = [DEAL.id] as const;

export type DealAsset = LibraryAsset & {
  step: number;
  timing: string;
  audience: HarborstoneSegmentId | null;
  /** Consent the send relies on: a service notice, marketing, or an internal audience. */
  purpose: "transactional" | "marketing" | "internal" | "public";
};

const embargoed = (id: string): Approval => ({
  id,
  status: "Approved",
  approvedOn: "2026-09-21",
  expiresOn: "2027-03-31",
  embargoed: true,
});

/** The announcement package, in release order. */
export const DEAL_ASSETS: DealAsset[] = [
  {
    id: "asset-hs-bayview-advisor-faq",
    name: "Advisor talking points and FAQ",
    kind: "Internal FAQ",
    channel: "email",
    step: 1,
    timing: "07:30 ET, before the announcement",
    audience: "segment-harborstone-advisors",
    purpose: "internal",
    approval: embargoed("COMP-2026-0901"),
    disclosures: ["forward-looking"],
  },
  {
    id: "asset-hs-bayview-press-release",
    name: "Joint press release",
    kind: "Press release",
    channel: null,
    step: 2,
    timing: "08:00 ET, at the announcement",
    audience: null,
    purpose: "public",
    approval: embargoed("COMP-2026-0902"),
    disclosures: ["forward-looking", "closing-conditions"],
  },
  {
    id: "asset-hs-bayview-client-letter",
    name: "Welcome letter to Bayview clients",
    kind: "Email",
    channel: "email",
    step: 3,
    timing: "08:15 ET",
    audience: "segment-bayview-clients",
    purpose: "transactional",
    approval: embargoed("COMP-2026-0903"),
    disclosures: ["forward-looking", "closing-conditions"],
  },
  {
    id: "asset-hs-bayview-client-note",
    name: "What the Bayview news means for you",
    kind: "Email",
    channel: "email",
    step: 3,
    timing: "08:15 ET",
    audience: "segment-harborstone-clients",
    purpose: "transactional",
    approval: embargoed("COMP-2026-0904"),
    disclosures: ["closing-conditions"],
  },
  {
    id: "asset-hs-bayview-sms",
    name: "SMS: news about your account",
    kind: "SMS",
    channel: "sms",
    step: 4,
    timing: "08:30 ET",
    audience: "segment-bayview-clients",
    purpose: "marketing",
    approval: embargoed("COMP-2026-0905"),
    disclosures: [],
    failed: "Required disclosures present",
  },
  {
    id: "asset-hs-bayview-webinar",
    name: "Webinar invite: meet the Bayview retirement team",
    kind: "Email",
    channel: "email",
    step: 5,
    timing: "Week 1",
    audience: "segment-harborstone-clients",
    purpose: "marketing",
    approval: { id: "COMP-2026-0911", status: "Pending" },
    disclosures: ["forward-looking"],
  },
];

/** Relationship-growth content: one approved explainer per product, used in account plans. */
export const GROWTH_CAMPAIGN = {
  id: "camp-harborstone-growth",
  name: "Harborstone Relationship Growth",
  status: "Active",
} as const;

export const GROWTH_ASSETS: LibraryAsset[] = [
  {
    id: "asset-hs-managed-portfolio",
    name: "One relationship, one plan: managed portfolios",
    kind: "Email",
    channel: "email",
    approval: approved("COMP-2026-0110", "2026-01-10", "2027-01-10"),
    disclosures: ["investment-risk", "past-performance"],
    explains: ["managed-portfolio"],
  },
  {
    id: "asset-hs-ocio",
    name: "Outsourced CIO for foundations and endowments",
    kind: "Email",
    channel: "email",
    approval: approved("COMP-2026-0220", "2026-02-20", "2027-02-20"),
    disclosures: ["investment-risk", "past-performance"],
    explains: ["ocio"],
  },
  {
    id: "asset-hs-cash-program",
    name: "A cash program that works harder",
    kind: "Email",
    channel: "email",
    approval: approved("COMP-2026-0311", "2026-03-11", "2027-03-11"),
    disclosures: ["not-fdic"],
    explains: ["cash-management"],
  },
  {
    id: "asset-hs-muni-ladder",
    name: "Building a municipal bond ladder",
    kind: "Email",
    channel: "email",
    approval: approved("COMP-2026-0318", "2026-03-18", "2027-03-18"),
    disclosures: ["investment-risk", "tax-legal"],
    explains: ["muni-ladder"],
  },
  {
    id: "asset-hs-after-the-sale",
    name: "After the sale: a plan for your liquidity",
    kind: "Email",
    channel: "email",
    approval: approved("COMP-2026-0402", "2026-04-02", "2027-04-02"),
    disclosures: ["investment-risk", "tax-legal"],
    explains: ["managed-portfolio", "trust-services"],
  },
  {
    id: "asset-hs-daf",
    name: "Donor-advised funds: giving on your timeline",
    kind: "Email",
    channel: "email",
    approval: approved("COMP-2026-0305", "2026-03-05", "2027-03-05"),
    disclosures: ["tax-legal", "investment-risk"],
    explains: ["daf"],
  },
  {
    id: "asset-hs-trust-overview",
    name: "Trust and estate services overview",
    kind: "Email",
    channel: "email",
    approval: {
      id: "COMP-2025-0808",
      status: "Expired",
      approvedOn: "2025-08-08",
      expiresOn: "2026-08-08",
    },
    disclosures: ["tax-legal"],
    explains: ["trust-services"],
  },
  {
    id: "asset-hs-private-credit",
    name: "Private credit: what to know",
    kind: "Email",
    channel: "email",
    approval: { id: "COMP-2026-0715", status: "Pending" },
    disclosures: ["investment-risk", "past-performance"],
    explains: ["private-credit"],
  },
  {
    id: "asset-hs-401k-review",
    name: "Is your 401(k) plan still right for your team?",
    kind: "Email",
    channel: "email",
    approval: approved("COMP-2026-0120", "2026-01-20", "2027-01-20"),
    disclosures: ["investment-risk"],
    explains: ["retirement-plan"],
  },
  {
    id: "asset-hs-portfolio-lending",
    name: "Borrowing against your portfolio",
    kind: "Email",
    channel: "email",
    approval: approved("COMP-2026-0505", "2026-05-05", "2027-05-05"),
    disclosures: ["investment-risk"],
    explains: ["securities-lending"],
  },
];

export const ADVISORS = {
  institutional: {
    id: "advisor-institutional",
    name: "Marcus Oyelaran",
    title: "Institutional consultant",
  },
  business: { id: "advisor-business", name: "Dana Whitfield", title: "Senior wealth advisor" },
  family: { id: "advisor-family", name: "Priya Raman", title: "Family office director" },
} as const;

export const CLIENT_TYPES = {
  foundation: {
    name: "Foundation",
    advisor: "institutional",
    roles: [
      ["Executive director", 5],
      ["Board treasurer", 6],
      ["Investment committee chair", 6],
    ],
  },
  business: {
    name: "Business owner",
    advisor: "business",
    roles: [
      ["Owner", 6],
      ["Chief financial officer", 5],
      ["HR director", 3],
    ],
  },
  family: {
    name: "Family office",
    advisor: "family",
    roles: [
      ["Principal", 6],
      ["Chief investment officer", 5],
      ["Next-generation member", 3],
    ],
  },
} as const;
export type ClientType = keyof typeof CLIENT_TYPES;

type ClientSpec = {
  name: string;
  type: ClientType;
  /** Assets with Harborstone, in $ millions, by product. */
  holds: Partial<Record<ProductKey, number>>;
  /** Estimated assets held elsewhere, in $ millions. */
  heldAway: number;
  signals: Array<[SignalKey, number, string]>;
};

export const CLIENTS: ClientSpec[] = [
  {
    name: "Cedar Valley Community Foundation",
    type: "foundation",
    holds: { "managed-portfolio": 30, "cash-management": 12 },
    heldAway: 65,
    signals: [
      ["held-away", 21, "Endowment pool still custodied at a regional bank"],
      ["spending-policy", 9, "Board voted to raise the payout from 4% to 5%"],
      ["rate-sensitivity", 3, "$12M operating reserve in a sweep account"],
    ],
  },
  {
    name: "Bayshore Arts Endowment",
    type: "foundation",
    holds: { ocio: 70, "private-credit": 10, "cash-management": 8 },
    heldAway: 20,
    signals: [["excess-cash", 14, "Capital campaign receipts sitting in operating cash"]],
  },
  {
    name: "Redwood Coast Land Trust",
    type: "foundation",
    holds: { ocio: 20, "cash-management": 6 },
    heldAway: 15,
    signals: [["spending-policy", 30, "Stewardship fund payout under review"]],
  },
  {
    name: "Mission Hills Youth Fund",
    type: "foundation",
    holds: { "managed-portfolio": 10, "cash-management": 4, daf: 2 },
    heldAway: 9,
    signals: [["held-away", 45, "Scholarship fund held at a brokerage"]],
  },
  {
    name: "Pacific Dental Partners",
    type: "business",
    holds: { "retirement-plan": 6, "cash-management": 2.5 },
    heldAway: 30,
    signals: [
      ["liquidity-event", 14, "Letter of intent to sell two practices to a dental group"],
      ["plan-review", 40, "401(k) provider contract up for renewal"],
    ],
  },
  {
    name: "Summit Ridge Surgical Group",
    type: "business",
    holds: { "cash-management": 5 },
    heldAway: 22,
    signals: [
      ["plan-review", 12, "Partners asked for a 401(k) fee benchmark"],
      ["excess-cash", 20, "Cash balance three times the operating target"],
    ],
  },
  {
    name: "Coastal Freight Logistics",
    type: "business",
    holds: { "retirement-plan": 18, "cash-management": 9, "securities-lending": 4 },
    heldAway: 12,
    signals: [["rate-sensitivity", 5, "Floating-rate equipment loans reprice with the Fed"]],
  },
  {
    name: "Golden State Veterinary Group",
    type: "business",
    holds: { "retirement-plan": 8, "managed-portfolio": 4 },
    heldAway: 18,
    signals: [["liquidity-event", 25, "Minority stake sale to a private equity firm"]],
  },
  {
    name: "Marin Family Office",
    type: "family",
    holds: { "managed-portfolio": 80, "muni-ladder": 25, "cash-management": 15 },
    heldAway: 210,
    signals: [
      ["held-away", 18, "Two outside managers under review"],
      ["next-gen", 33, "Founder's children joining the family council"],
      ["rate-sensitivity", 4, "$15M in cash and short Treasuries rolling this quarter"],
    ],
  },
  {
    name: "Sierra Crest Family Office",
    type: "family",
    holds: {
      "managed-portfolio": 120,
      "trust-services": 60,
      daf: 20,
      "private-credit": 30,
      "muni-ladder": 10,
    },
    heldAway: 60,
    signals: [["excess-cash", 10, "Distribution from a real estate partnership"]],
  },
  {
    name: "Lakehouse Capital Family Office",
    type: "family",
    holds: { "managed-portfolio": 60, "securities-lending": 15, "trust-services": 20 },
    heldAway: 140,
    signals: [
      ["held-away", 27, "Legacy account at a wirehouse"],
      ["next-gen", 50, "Estate plan update requested"],
    ],
  },
  {
    name: "Point Reyes Family Office",
    type: "family",
    holds: { "managed-portfolio": 40, daf: 10, "muni-ladder": 10 },
    heldAway: 45,
    signals: [["liquidity-event", 8, "Sale of the family's winery closes next quarter"]],
  },
];

export const clientId = (name: string) =>
  `client-${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
export const CLIENT_NAMES = CLIENTS.map((client) => client.name) as [string, ...string[]];
