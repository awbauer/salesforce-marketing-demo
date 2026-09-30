import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";
import { jsonSchema, type ToolSet, tool } from "ai";
import type { z } from "zod";
import {
  buildDataset,
  createMemoryStore,
  type Dataset,
  type GraphBackend,
  KNOWLEDGE_GRAPH_TOOL_SPECS,
  MEMORY_TOOL_SPECS,
  type MemoryStore,
  type MemoryToolContext,
  queryApiBackend,
} from "../../../../packages/knowledge-graph/src/index.ts";

// One widened shape lets the loop register each spec; each spec's schema still validates input.
type AnyGraphToolSpec = {
  name: string;
  title: string;
  description: string;
  input: z.ZodObject;
  run: (
    backend: GraphBackend,
    input: never,
    context: MemoryToolContext,
  ) => Promise<Record<string, unknown>>;
};

export const KNOWLEDGE_GRAPH_MCP_NAME = "workbench-knowledge-graph";
export const KNOWLEDGE_GRAPH_TOOL_PREFIX = "graph_";

type GraphEnv = { NEO4J_QUERY_URL?: string; NEO4J_USERNAME?: string; NEO4J_PASSWORD?: string };

let fixtureDataset: Dataset | undefined;
// Local long-term memory lives as long as the isolate, like the rest of the local copy.
let fixtureMemory: MemoryStore | undefined;

/**
 * Neo4j Aura when its Worker secrets are set; otherwise the identical fictional dataset in memory,
 * so local development, tests, and evaluations run without a database.
 */
export function knowledgeGraphBackend(
  env: GraphEnv,
  fetchImpl?: typeof fetch,
  options: { maxRows?: number } = {},
): GraphBackend {
  if (env.NEO4J_QUERY_URL && env.NEO4J_USERNAME && env.NEO4J_PASSWORD)
    return queryApiBackend(
      {
        url: env.NEO4J_QUERY_URL,
        username: env.NEO4J_USERNAME,
        password: env.NEO4J_PASSWORD,
        maxRows: options.maxRows,
      },
      fetchImpl,
    );
  fixtureDataset ??= buildDataset();
  fixtureMemory ??= createMemoryStore();
  return { kind: "fixture", dataset: fixtureDataset, memory: fixtureMemory };
}

/**
 * Read-only MCP server over the curated, parameterized graph tools; no free-form Cypher. The
 * memory recall tools are registered only with a server-provided workspace, which the model
 * can't choose or see.
 */
export function createKnowledgeGraphMcpServer(backend: GraphBackend, memory?: MemoryToolContext) {
  const server = new McpServer({ name: KNOWLEDGE_GRAPH_MCP_NAME, version: "1.0.0" });
  const specs = [...KNOWLEDGE_GRAPH_TOOL_SPECS, ...(memory ? MEMORY_TOOL_SPECS : [])];
  const context = memory ?? { workspaceId: "", now: () => new Date() };
  for (const spec of specs as readonly AnyGraphToolSpec[]) {
    server.registerTool(
      spec.name,
      {
        title: spec.title,
        description: `${spec.description} Source: ${backend.kind === "neo4j" ? "Neo4j knowledge graph" : "local copy of the fictional knowledge graph"}.`,
        inputSchema: spec.input,
        annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
      },
      async (input: unknown) => {
        try {
          const result = {
            ...(await spec.run(backend, input as never, context)),
            source: backend.kind,
          };
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result) }],
            structuredContent: result,
          };
        } catch (error) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: `The knowledge graph query failed: ${error instanceof Error ? error.message : "unknown error"}.`,
              },
            ],
          };
        }
      },
    );
  }
  return server;
}

/** In-process MCP client for the orchestrator, mirroring the campaign-context connector. */
export async function connectKnowledgeGraphTools(
  backend: GraphBackend,
  memory?: MemoryToolContext,
) {
  const server = createKnowledgeGraphMcpServer(backend, memory);
  const client = new Client({ name: "workbench-orchestrator", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const { tools: listed } = await client.listTools();
  const tools: ToolSet = Object.fromEntries(
    listed.map((definition) => [
      `${KNOWLEDGE_GRAPH_TOOL_PREFIX}${definition.name}`,
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
