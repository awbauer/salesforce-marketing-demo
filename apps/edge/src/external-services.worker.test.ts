import { describe, expect, it } from "vitest";
import { connectExternalServiceTools } from "./external-services/server";

const now = () => new Date("2026-11-01T12:00:00Z");
type Output = { structuredContent?: Record<string, unknown>; isError?: boolean };

function fakeFetch(routes: Record<string, unknown>, calls: string[] = []): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(`${url} ${new Headers(init?.headers).get("user-agent") ?? ""}`);
    const match = Object.keys(routes).find((prefix) => url.startsWith(prefix));
    if (!match) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify(routes[match]), { status: 200 });
  }) as typeof fetch;
}

describe("external services MCP", () => {
  it("returns upcoming public holidays in the window, across the year boundary", async () => {
    const { tools, close } = await connectExternalServiceTools({
      now,
      fetch: fakeFetch({
        "https://date.nager.at/api/v3/PublicHolidays/2026/CA": [
          {
            date: "2026-10-12",
            localName: "Thanksgiving",
            name: "Thanksgiving",
            global: true,
            counties: null,
          },
          {
            date: "2026-11-11",
            localName: "Remembrance Day",
            name: "Remembrance Day",
            global: false,
            counties: ["CA-AB"],
          },
          {
            date: "2026-12-25",
            localName: "Christmas Day",
            name: "Christmas Day",
            global: true,
            counties: null,
          },
        ],
        "https://date.nager.at/api/v3/PublicHolidays/2027/CA": [
          {
            date: "2027-01-01",
            localName: "New Year's Day",
            name: "New Year's Day",
            global: true,
            counties: null,
          },
        ],
      }),
    });
    try {
      const output = (await (
        tools.ext_get_public_holidays as unknown as { execute: (input: unknown) => Promise<Output> }
      ).execute({ country: "CA", days: 90 })) as Output;
      const holidays = output.structuredContent?.holidays as Array<{ date: string; scope: string }>;
      expect(holidays.map((holiday) => holiday.date)).toEqual([
        "2026-11-11",
        "2026-12-25",
        "2027-01-01",
      ]);
      expect(holidays[0]?.scope).toBe("regional");
      expect(output.structuredContent?.attribution).toContain("Nager.Date");
    } finally {
      await close();
    }
  });

  it("returns weather alerts at a location, most severe first, with a User-Agent", async () => {
    const calls: string[] = [];
    const feature = (event: string, severity: string, headline: string) => ({
      properties: {
        event,
        severity,
        urgency: "Expected",
        headline,
        areaDesc: "San Diego County Coastal Areas",
      },
    });
    const { tools, close } = await connectExternalServiceTools({
      now,
      fetch: fakeFetch(
        {
          "https://api.weather.gov/alerts/active?point=32.7157,-117.1611": {
            features: [
              feature("Beach Hazards Statement", "Moderate", "Beach hazards"),
              feature("Coastal Flood Warning", "Severe", "Coastal flooding"),
            ],
          },
          "https://api.weather.gov/alerts/active?area=CA": {
            features: [feature("Wind Advisory", "Minor", "Windy in the desert")],
          },
        },
        calls,
      ),
    });
    try {
      const output = (await (
        tools.ext_get_weather_alerts as unknown as { execute: (input: unknown) => Promise<Output> }
      ).execute({ location: "san-diego" })) as Output;
      const alerts = output.structuredContent?.alerts as Array<{ event: string }>;
      expect(alerts.map((alert) => alert.event)).toEqual([
        "Coastal Flood Warning",
        "Beach Hazards Statement",
      ]);
      expect(output.structuredContent?.elsewhereInCalifornia).toEqual([
        "Wind Advisory (Minor): San Diego County Coastal Areas",
      ]);
      expect(calls.every((call) => call.includes("northstar-marketing-workbench"))).toBe(true);
    } finally {
      await close();
    }
  });

  it("reports an unreachable service as a tool error instead of inventing data", async () => {
    const { tools, close } = await connectExternalServiceTools({ now, fetch: fakeFetch({}) });
    try {
      const output = (await (
        tools.ext_get_public_holidays as unknown as { execute: (input: unknown) => Promise<Output> }
      ).execute({ country: "US", days: 30 })) as Output;
      expect(output.isError).toBe(true);
    } finally {
      await close();
    }
  });
});
