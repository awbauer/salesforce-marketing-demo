import { z } from "zod";

/**
 * Public holidays from Nager.Date (https://date.nager.at), a free, keyless public API. Used to
 * schedule sales outreach around an account's local holidays.
 */

export const HOLIDAY_COUNTRIES = ["US", "CA", "GB", "DE", "NO", "NL", "AU"] as const;
export type HolidayCountry = (typeof HOLIDAY_COUNTRIES)[number];

const NagerHolidaySchema = z.object({
  date: z.string(),
  localName: z.string(),
  name: z.string(),
  global: z.boolean(),
  counties: z.array(z.string()).nullable(),
  types: z.array(z.string()).optional(),
});

export type Holiday = {
  date: string;
  name: string;
  localName: string;
  /** Nationwide, or only in some states or provinces. */
  scope: "national" | "regional";
  regions: string[];
};

export const nagerUrl = (year: number, country: string) =>
  `https://date.nager.at/api/v3/PublicHolidays/${year}/${encodeURIComponent(country)}`;

/**
 * Public holidays in a country within `days` of `from` (inclusive), across a year boundary when
 * needed, earliest first.
 */
export async function fetchUpcomingHolidays(
  country: HolidayCountry,
  from: Date,
  days: number,
  fetchImpl: typeof fetch = fetch,
): Promise<{ holidays: Holiday[] } | { error: string }> {
  const until = new Date(from.getTime() + days * 86_400_000);
  const years = [...new Set([from.getUTCFullYear(), until.getUTCFullYear()])];
  const all: Holiday[] = [];
  for (const year of years) {
    let response: Response;
    try {
      response = await fetchImpl(nagerUrl(year, country), {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(8_000),
      });
    } catch {
      return { error: "Nager.Date could not be reached" };
    }
    if (!response.ok) return { error: `Nager.Date returned HTTP ${response.status}` };
    const parsed = z.array(NagerHolidaySchema).safeParse(await response.json().catch(() => null));
    if (!parsed.success) return { error: "Nager.Date returned an unexpected response" };
    for (const holiday of parsed.data)
      all.push({
        date: holiday.date,
        name: holiday.name,
        localName: holiday.localName,
        scope: holiday.global ? "national" : "regional",
        regions: holiday.counties ?? [],
      });
  }
  const start = from.toISOString().slice(0, 10);
  const end = until.toISOString().slice(0, 10);
  return {
    holidays: all
      .filter((holiday) => holiday.date >= start && holiday.date <= end)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
  };
}
