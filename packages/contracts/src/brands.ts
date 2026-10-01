import { INSTANCE_BRANDS, INSTANCE_PROFILE } from "./generated/instance.ts";

/** Display names for this instance's parent brand and the two vertical modules. */
export const PARENT_BRAND: string = INSTANCE_BRANDS.parent;
export const RESTAURANT_BRAND: string = INSTANCE_BRANDS.restaurant;
export const WEALTH_BRAND: string = INSTANCE_BRANDS.wealth;

/** Fixture Campaign id in local mode; a connected sandbox's own record when the profile sets one. */
export const FIXTURE_CAMPAIGN_ID = "701xx0000A1B2C3D4E";
export const SAMPLE_CAMPAIGN_ID: string =
  INSTANCE_PROFILE.salesforce.sampleCampaignId ?? FIXTURE_CAMPAIGN_ID;
