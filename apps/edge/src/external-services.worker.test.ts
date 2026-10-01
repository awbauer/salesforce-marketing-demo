import { describe, expect, it } from "vitest";
import { parseRateDecision } from "./external-services/fed-news";
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
      expect(calls.every((call) => call.includes("marketing-workbench"))).toBe(true);
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

  it("reads the latest FOMC rate decision from the Federal Reserve feed", async () => {
    const feed = `<?xml version="1.0"?><rss><channel>
      <item><title>Minutes of the Federal Open Market Committee</title>
        <link><![CDATA[https://www.federalreserve.gov/newsevents/pressreleases/monetary20261021a.htm]]></link>
        <pubDate><![CDATA[Wed, 21 Oct 2026 18:00:00 GMT]]></pubDate></item>
      <item><title>Federal Reserve issues FOMC statement</title>
        <link><![CDATA[https://www.federalreserve.gov/newsevents/pressreleases/monetary20261028a.htm]]></link>
        <pubDate><![CDATA[Wed, 28 Oct 2026 18:00:00 GMT]]></pubDate></item>
      <item><title>Elsewhere</title><link><![CDATA[https://example.com/x]]></link>
        <pubDate><![CDATA[Wed, 28 Oct 2026 18:00:00 GMT]]></pubDate></item>
    </channel></rss>`;
    const page = `<html><body><nav>Share</nav><p>Recent indicators suggest growth.</p>
      <p>In support of its goals, the Committee decided to maintain the target range for the federal
      funds rate at 3-3/4 to 4&nbsp;percent. The Committee will continue to monitor.</p></body></html>`;
    const calls: string[] = [];
    const fetchText = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(`${url} ${new Headers(init?.headers).get("user-agent") ?? ""}`);
      if (url.endsWith("press_monetary.xml")) return new Response(feed, { status: 200 });
      if (url.endsWith("monetary20261028a.htm")) return new Response(page, { status: 200 });
      return new Response("not found", { status: 404 });
    }) as typeof fetch;
    const { tools, close } = await connectExternalServiceTools({ now, fetch: fetchText });
    try {
      const output = (await (
        tools.ext_get_fed_announcements as unknown as {
          execute: (input: unknown) => Promise<Output>;
        }
      ).execute({})) as Output;
      const data = output.structuredContent as Record<string, unknown>;
      expect(data.event).toBe("rate-hold");
      expect(data.latestDecision).toMatchObject({
        action: "maintain",
        change: null,
        targetRange: "3-3/4 to 4 percent",
        publishedAt: "2026-10-28T18:00:00.000Z",
        hoursAgo: 90,
      });
      expect(String((data.latestDecision as { statement: string }).statement)).toMatch(
        /^The Committee decided to maintain/,
      );
      // Links outside the Federal Reserve's site are never followed or returned.
      expect((data.recentReleases as unknown[]).length).toBe(2);
      expect(calls.every((call) => call.includes("marketing-workbench"))).toBe(true);
    } finally {
      await close();
    }
  });

  it("parses a rate increase and its size", () => {
    expect(
      parseRateDecision(
        "<p>The Committee decided to raise the target range for the federal funds rate by 1/4 percentage point to 3-3/4 to 4 percent, in support of its goals.</p>",
      ),
    ).toMatchObject({
      action: "raise",
      event: "rate-increase",
      change: "1/4 percentage point",
      targetRange: "3-3/4 to 4 percent",
    });
    expect(parseRateDecision("<p>No decision here.</p>")).toBeNull();
  });

  it("reports an unreachable Federal Reserve feed as a tool error", async () => {
    const { tools, close } = await connectExternalServiceTools({ now, fetch: fakeFetch({}) });
    try {
      const output = (await (
        tools.ext_get_fed_announcements as unknown as {
          execute: (input: unknown) => Promise<Output>;
        }
      ).execute({})) as Output;
      expect(output.isError).toBe(true);
    } finally {
      await close();
    }
  });
});
