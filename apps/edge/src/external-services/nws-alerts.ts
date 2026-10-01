import { z } from "zod";
import { LOCATIONS, type LocationId } from "../campaign-context/open-meteo.ts";

/**
 * Active weather alerts from the US National Weather Service API (https://api.weather.gov), a free,
 * keyless public API. It asks callers to identify themselves with a User-Agent.
 */

const USER_AGENT = "marketing-workbench (fictional demo; no customer data)";

const FeatureSchema = z.object({
  properties: z.object({
    event: z.string(),
    severity: z.string(),
    urgency: z.string(),
    certainty: z.string().optional(),
    headline: z.string().nullable().optional(),
    areaDesc: z.string(),
    effective: z.string().nullable().optional(),
    expires: z.string().nullable().optional(),
    instruction: z.string().nullable().optional(),
  }),
});
const CollectionSchema = z.object({ features: z.array(FeatureSchema) });

export type WeatherAlert = {
  event: string;
  severity: string;
  urgency: string;
  headline: string | null;
  area: string;
  effective: string | null;
  expires: string | null;
  instruction: string | null;
};

const SEVERITY_ORDER = ["Extreme", "Severe", "Moderate", "Minor", "Unknown"];

function toAlert(feature: z.infer<typeof FeatureSchema>): WeatherAlert {
  const alert = feature.properties;
  return {
    event: alert.event,
    severity: alert.severity,
    urgency: alert.urgency,
    headline: alert.headline ?? null,
    area: alert.areaDesc.slice(0, 240),
    effective: alert.effective ?? null,
    expires: alert.expires ?? null,
    instruction: alert.instruction ? alert.instruction.replace(/\s+/g, " ").slice(0, 400) : null,
  };
}

async function fetchAlerts(url: string, fetchImpl: typeof fetch) {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: { accept: "application/geo+json", "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    return { error: "The National Weather Service could not be reached" } as const;
  }
  if (!response.ok)
    return { error: `The National Weather Service returned HTTP ${response.status}` } as const;
  const parsed = CollectionSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success)
    return { error: "The National Weather Service returned an unexpected response" } as const;
  return {
    alerts: parsed.data.features
      .map(toAlert)
      .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)),
  } as const;
}

/** Active alerts at a Sample Kitchen location, plus a count of alerts elsewhere in California. */
export async function fetchLocationAlerts(location: LocationId, fetchImpl: typeof fetch = fetch) {
  const { latitude, longitude, city } = LOCATIONS[location];
  const [atLocation, statewide] = await Promise.all([
    fetchAlerts(`https://api.weather.gov/alerts/active?point=${latitude},${longitude}`, fetchImpl),
    fetchAlerts("https://api.weather.gov/alerts/active?area=CA", fetchImpl),
  ]);
  if ("error" in atLocation) return atLocation;
  return {
    city,
    alerts: atLocation.alerts.slice(0, 5),
    elsewhereInCalifornia:
      "error" in statewide
        ? null
        : statewide.alerts
            .filter((alert) => !atLocation.alerts.some((here) => here.headline === alert.headline))
            .slice(0, 5)
            .map((alert) => `${alert.event} (${alert.severity}): ${alert.area}`),
  };
}
