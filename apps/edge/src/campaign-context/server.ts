import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";
import { jsonSchema, type ToolSet, tool } from "ai";
import { z } from "zod";
import { fetchCurrentWeather, LOCATION_IDS, LOCATIONS } from "./open-meteo.ts";
import { RESTAURANT_IDS, RESTAURANT_PROFILES } from "./restaurant-profile.ts";

export const CAMPAIGN_CONTEXT_MCP_NAME = "northstar-campaign-context";
/** Tool keys in the orchestrator carry this prefix, mirroring the Salesforce MCP naming. */
export const CAMPAIGN_CONTEXT_TOOL_PREFIX = "context_";

export type CampaignContextDependencies = { fetch?: typeof fetch };

/**
 * Builds the campaign-context MCP server: a mocked restaurant profile and live weather. Both tools
 * are read-only; campaign drafting stays with the governed Salesforce content tool.
 */
export function createCampaignContextMcpServer(dependencies: CampaignContextDependencies = {}) {
  const server = new McpServer({ name: CAMPAIGN_CONTEXT_MCP_NAME, version: "1.0.0" });
  server.registerTool(
    "get_restaurant_profile",
    {
      title: "Get restaurant profile",
      description:
        "Mocked profile for a fictional California fast-casual restaurant: concept, 24/7 hours, location city ID for weather, menu with prices, dayparts, and tags, customer favorites, brand voice, aggregate audience facts, and promotion rules.",
      inputSchema: z.object({
        restaurant: z.enum(RESTAURANT_IDS).describe("Restaurant to look up; use sunwise-kitchen"),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ restaurant }) => {
      const profile = RESTAURANT_PROFILES[restaurant];
      return {
        content: [{ type: "text", text: JSON.stringify(profile) }],
        structuredContent: profile as unknown as Record<string, unknown>,
      };
    },
  );
  server.registerTool(
    "get_current_weather",
    {
      title: "Get current weather",
      description: `Current weather and local observation time for a California city from Open-Meteo: temperature and feels-like in °F, condition, precipitation, wind, and day or night. Cities: ${LOCATION_IDS.map((id) => `${id} (${LOCATIONS[id].city})`).join(", ")}.`,
      inputSchema: z.object({
        location: z.enum(LOCATION_IDS).describe("California city to check"),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ location }) => {
      const result = await fetchCurrentWeather(location, dependencies.fetch);
      if ("error" in result)
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Weather for ${LOCATIONS[location].city} could not be retrieved: ${result.error}.`,
            },
          ],
        };
      const output = {
        ...result.weather,
        attribution: "Weather data by Open-Meteo.com (CC BY 4.0)",
      };
      return {
        content: [{ type: "text", text: JSON.stringify(output) }],
        structuredContent: output,
      };
    },
  );
  return server;
}

/**
 * Connects an in-process MCP client to the campaign-context server and exposes its tools to the AI SDK.
 * The orchestrator uses the same MCP protocol path as external clients without a network hop,
 * because the public MCP route sits behind Cloudflare Access.
 */
export async function connectCampaignContextTools(dependencies: CampaignContextDependencies = {}) {
  const server = createCampaignContextMcpServer(dependencies);
  const client = new Client({ name: "northstar-orchestrator", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const { tools: listed } = await client.listTools();
  const tools: ToolSet = Object.fromEntries(
    listed.map((definition) => [
      `${CAMPAIGN_CONTEXT_TOOL_PREFIX}${definition.name}`,
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
