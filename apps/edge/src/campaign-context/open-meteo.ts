import { z } from "zod";

export const CALIFORNIA_TIME_ZONE = "America/Los_Angeles";

/** Supported California cities; coordinates are the public city centers. */
export const LOCATIONS = {
  "los-angeles": { city: "Los Angeles", latitude: 34.0522, longitude: -118.2437 },
  "san-francisco": { city: "San Francisco", latitude: 37.7749, longitude: -122.4194 },
  "san-diego": { city: "San Diego", latitude: 32.7157, longitude: -117.1611 },
  sacramento: { city: "Sacramento", latitude: 38.5816, longitude: -121.4944 },
  fresno: { city: "Fresno", latitude: 36.7378, longitude: -119.7871 },
} as const;
export type LocationId = keyof typeof LOCATIONS;
export const LOCATION_IDS = Object.keys(LOCATIONS) as [LocationId, ...LocationId[]];

export type Condition = "clear" | "cloudy" | "fog" | "drizzle" | "rain" | "storm" | "snow";

export type Weather = {
  source: "Open-Meteo";
  city: string;
  timeZone: string;
  /** Local observation time in the city's time zone, as reported by Open-Meteo. */
  observedAtLocal: string;
  temperatureF: number;
  feelsLikeF: number;
  precipitationIn: number;
  windMph: number;
  condition: Condition;
  isDay: boolean;
};

const OpenMeteoCurrentSchema = z.object({
  current: z.object({
    time: z.string(),
    temperature_2m: z.number(),
    apparent_temperature: z.number(),
    precipitation: z.number(),
    weather_code: z.number().int(),
    wind_speed_10m: z.number(),
    is_day: z.number().int(),
  }),
});

/** Maps a WMO weather interpretation code, as returned by Open-Meteo, to a campaign condition. */
export function conditionFromWmo(code: number): Condition {
  if (code <= 1) return "clear";
  if (code <= 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "storm";
  return "cloudy";
}

export function openMeteoUrl(location: LocationId) {
  const { latitude, longitude } = LOCATIONS[location];
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: "temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,is_day",
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
    precipitation_unit: "inch",
    timezone: CALIFORNIA_TIME_ZONE,
  });
  return `https://api.open-meteo.com/v1/forecast?${params}`;
}

/**
 * Reads current conditions from Open-Meteo (free, no API key; data CC BY 4.0). Returns an error
 * reason instead of throwing so callers can explain the gap instead of failing the turn.
 */
export async function fetchCurrentWeather(
  location: LocationId,
  fetchImpl: typeof fetch = fetch,
): Promise<{ weather: Weather } | { error: string }> {
  try {
    const response = await fetchImpl(openMeteoUrl(location), {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return { error: `Open-Meteo returned HTTP ${response.status}` };
    const parsed = OpenMeteoCurrentSchema.safeParse(await response.json());
    if (!parsed.success) return { error: "Open-Meteo returned an unexpected response" };
    const current = parsed.data.current;
    return {
      weather: {
        source: "Open-Meteo",
        city: LOCATIONS[location].city,
        timeZone: CALIFORNIA_TIME_ZONE,
        observedAtLocal: current.time,
        temperatureF: Math.round(current.temperature_2m),
        feelsLikeF: Math.round(current.apparent_temperature),
        precipitationIn: current.precipitation,
        windMph: Math.round(current.wind_speed_10m),
        condition: conditionFromWmo(current.weather_code),
        isDay: current.is_day === 1,
      },
    };
  } catch (error) {
    return {
      error:
        error instanceof Error && error.name === "TimeoutError"
          ? "Open-Meteo timed out"
          : "Open-Meteo could not be reached",
    };
  }
}
