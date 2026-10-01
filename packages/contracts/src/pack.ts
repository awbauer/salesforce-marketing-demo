import { z } from "zod";

export const PACK_IDS = [
  "composite",
  "retail",
  "restaurant",
  "financial-services",
  "healthcare-payer",
  "b2b-technology",
  "travel-hospitality",
] as const;
export const PackIdSchema = z.enum(PACK_IDS);
export type PackId = z.infer<typeof PackIdSchema>;

export const CAMPAIGN_SLOTS = [
  "camp-fall",
  "camp-winter",
  "camp-spring",
  "camp-holiday",
  "camp-summer",
] as const;
export const CHANNEL_IDS = ["email", "sms", "mobile-app"] as const;

/** The readiness demo hinges on this rule: the fall hero email fails it. */
export const REQUIRED_BRAND_RULE = "Accessible alt text";

export const VocabularySchema = z.object({
  /** Fictional B2B or partner accounts the buyer-group and outreach tools reason about. */
  accounts: z
    .array(
      z.object({
        name: z.string().min(2).max(60),
        country: z.string().length(2),
        countryName: z.string().min(2).max(40),
      }),
    )
    .length(12),
  /** One campaign per seasonal slot, in CAMPAIGN_SLOTS order, so ids stay stable across packs. */
  campaigns: z
    .array(
      z.object({
        id: z.enum(CAMPAIGN_SLOTS),
        name: z.string().min(3).max(60),
        status: z.enum(["Active", "Planned", "Completed"]),
        channels: z.array(z.enum(CHANNEL_IDS)).min(1),
      }),
    )
    .length(5),
  contentKinds: z.array(z.string().min(3).max(40)).length(3),
  brandRules: z
    .array(z.string().min(3).max(60))
    .length(6)
    .refine(
      (rules) => rules.includes(REQUIRED_BRAND_RULE),
      `Must include "${REQUIRED_BRAND_RULE}"`,
    ),
});
export type Vocabulary = z.infer<typeof VocabularySchema>;

export const PackSchema = z.object({
  id: PackIdSchema,
  label: z.string(),
  /** tour: the full multi-industry demo; vertical: industry-specific tools and data; core: core marketing flows with this industry's vocabulary. */
  tier: z.enum(["tour", "vertical", "core"]),
  summary: z.string(),
  modules: z.object({ restaurant: z.boolean(), wealth: z.boolean() }),
  vocabulary: VocabularySchema,
  /** Ids from the use-case catalog (apps/web/src/usecases/catalog.ts) this pack offers. */
  useCases: z.array(z.string()).min(1),
  /** One paragraph of industry context the orchestrator's prompt carries. */
  promptContext: z.string().max(600),
  /** Defaults the init wizard offers for the sample client profile. */
  sample: z.object({
    brandVoice: z.string(),
    customerSegments: z.array(z.string()),
    products: z.array(z.string()),
    compliance: z.array(z.string()),
  }),
});
export type IndustryPack = z.infer<typeof PackSchema>;

/** What the init wizard's personalization step may change; everything else stays the pack's. */
export const PersonalizationSchema = z.object({
  vocabulary: VocabularySchema.partial().optional(),
});
export type Personalization = z.infer<typeof PersonalizationSchema>;
