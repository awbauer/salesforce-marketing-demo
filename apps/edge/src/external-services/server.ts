import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";
import { jsonSchema, type ToolSet, tool } from "ai";
import { z } from "zod";
import { LOCATION_IDS, LOCATIONS } from "../campaign-context/open-meteo.ts";
import { fetchFedAnnouncements } from "./fed-news.ts";
import { fetchUpcomingHolidays, HOLIDAY_COUNTRIES } from "./nager-date.ts";
import { fetchLocationAlerts } from "./nws-alerts.ts";

export const EXTERNAL_SERVICES_MCP_NAME = "workbench-external-services";
/** Tool keys in the orchestrator carry this prefix. */
export const EXTERNAL_SERVICES_TOOL_PREFIX = "ext_";

export type ExternalServicesDependencies = { fetch?: typeof fetch; now?: () => Date };

function failure(text: string) {
  return { isError: true, content: [{ type: "text" as const, text }] };
}
function success(output: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(output) }],
    structuredContent: output,
  };
}

/**
 * Builds the external-services MCP server: free, keyless public sources the use cases rely on.
 * Nager.Date public holidays (sales outreach timing), National Weather Service alerts (service
 * disruption response), and Federal Reserve press releases (financial services news). All are
 * read-only.
 */
export function createExternalServicesMcpServer(dependencies: ExternalServicesDependencies = {}) {
  const server = new McpServer({ name: EXTERNAL_SERVICES_MCP_NAME, version: "1.0.0" });
  const now = dependencies.now ?? (() => new Date());
  server.registerTool(
    "get_public_holidays",
    {
      title: "Get public holidays",
      description: `Upcoming public holidays in a country from Nager.Date (free public API): date, name, local name, and whether it is national or regional. Use the account's country code from the knowledge graph. Countries: ${HOLIDAY_COUNTRIES.join(", ")}.`,
      inputSchema: z.object({
        country: z.enum(HOLIDAY_COUNTRIES).describe("ISO 3166-1 alpha-2 country code"),
        days: z.number().int().min(7).max(120).default(60).describe("How far ahead to look"),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ country, days }) => {
      const from = now();
      const result = await fetchUpcomingHolidays(country, from, days ?? 60, dependencies.fetch);
      if ("error" in result)
        return failure(`Public holidays could not be retrieved: ${result.error}.`);
      return success({
        country,
        from: from.toISOString().slice(0, 10),
        days: days ?? 60,
        holidays: result.holidays,
        attribution: "Public holidays by Nager.Date (date.nager.at)",
      });
    },
  );
  server.registerTool(
    "get_weather_alerts",
    {
      title: "Get weather alerts",
      description: `Active National Weather Service watches, warnings, and advisories at a Sample Kitchen location (free public API), most severe first, plus other active alerts elsewhere in California. Locations: ${LOCATION_IDS.map((id) => `${id} (${LOCATIONS[id].city})`).join(", ")}.`,
      inputSchema: z.object({
        location: z.enum(LOCATION_IDS).describe("Sample Kitchen location (city id)"),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ location }) => {
      const result = await fetchLocationAlerts(location, dependencies.fetch);
      if ("error" in result)
        return failure(`Weather alerts could not be retrieved: ${result.error}.`);
      return success({
        location,
        ...result,
        checkedAt: now().toISOString(),
        attribution: "Alerts from the National Weather Service (api.weather.gov)",
      });
    },
  );
  server.registerTool(
    "get_fed_announcements",
    {
      title: "Get Federal Reserve announcements",
      description:
        "The Federal Reserve's latest monetary policy news from its public press release feed (free, no key): the rate decision in the most recent FOMC statement (raise, lower, or maintain; the size of the change; the new target range; the statement's own sentence; when it was published) and the market event it maps to (rate-increase, rate-cut, or rate-hold) for looking up pre-approved content, plus the latest monetary policy releases.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () => {
      const result = await fetchFedAnnouncements(dependencies.fetch);
      if ("error" in result)
        return failure(`Federal Reserve news could not be retrieved: ${result.error}.`);
      const checkedAt = now();
      return success({
        latestDecision: result.decision
          ? {
              ...result.decision,
              hoursAgo: Math.max(
                0,
                Math.round(
                  (checkedAt.getTime() - new Date(result.decision.publishedAt).getTime()) /
                    3_600_000,
                ),
              ),
            }
          : null,
        event: result.decision?.event ?? null,
        recentReleases: result.releases.slice(0, 5),
        checkedAt: checkedAt.toISOString(),
        attribution: "Press releases from the Federal Reserve Board (federalreserve.gov)",
      });
    },
  );
  return server;
}

/** In-process MCP client for the orchestrator, mirroring the campaign-context connector. */
export async function connectExternalServiceTools(dependencies: ExternalServicesDependencies = {}) {
  const server = createExternalServicesMcpServer(dependencies);
  const client = new Client({ name: "workbench-orchestrator", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const { tools: listed } = await client.listTools();
  const tools: ToolSet = Object.fromEntries(
    listed.map((definition) => [
      `${EXTERNAL_SERVICES_TOOL_PREFIX}${definition.name}`,
      tool({
        description: definition.description ?? definition.name,
        inputSchema: jsonSchema(definition.inputSchema as Parameters<typeof jsonSchema>[0]),
        execute: async (input) =>
          client.callTool({ name: definition.name, arguments: input as Record<string, unknown> }),
      }),
    ]),
  );
  return {
    tools,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}
