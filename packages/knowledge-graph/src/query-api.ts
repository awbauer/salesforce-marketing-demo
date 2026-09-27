import type { GraphBackend, Row } from "./tools.ts";

export type QueryApiConfig = {
  url: string;
  username: string;
  password: string;
  timeoutMs?: number;
  /** Rows kept per statement; tool answers stay small, the graph explorer needs more. */
  maxRows?: number;
};

const MAX_ROWS = 200;

/**
 * Neo4j Query API v2 client (HTTPS; Workers cannot open Bolt connections). Tool queries run in
 * read access mode, so the database rejects writes regardless of the Cypher. `write` exists only
 * for the server's fixed long-term memory statements, never for anything a model authors.
 */
export function queryApiBackend(
  config: QueryApiConfig,
  fetchImpl: typeof fetch = fetch,
): Extract<GraphBackend, { kind: "neo4j" }> {
  const authorization = `Basic ${btoa(`${config.username}:${config.password}`)}`;
  const run = async (statement: string, parameters: Row, accessMode: "Read" | "Write") => {
    let response: Response;
    try {
      response = await fetchImpl(config.url, {
        method: "POST",
        headers: {
          authorization,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({ statement, parameters, accessMode }),
        signal: AbortSignal.timeout(config.timeoutMs ?? 8_000),
      });
    } catch (error) {
      throw new Error(
        error instanceof Error && error.name === "TimeoutError"
          ? "Neo4j did not respond in time"
          : "Neo4j could not be reached",
      );
    }
    const body = (await response.json().catch(() => ({}))) as {
      data?: { fields: string[]; values: unknown[][] };
      errors?: Array<{ code?: string; message?: string }>;
    };
    if (!response.ok || body.errors?.length) {
      const code = body.errors?.[0]?.code ?? `HTTP ${response.status}`;
      // Never echo the request or credentials; the error code is enough to diagnose.
      throw new Error(
        response.status === 401 || response.status === 403
          ? "Neo4j rejected the credentials"
          : /Unavailable|DatabaseNotFound/i.test(code)
            ? "The Neo4j instance is unavailable (it may be paused)"
            : `Neo4j query failed (${code})`,
      );
    }
    const fields = body.data?.fields ?? [];
    return (body.data?.values ?? [])
      .slice(0, config.maxRows ?? MAX_ROWS)
      .map(
        (values) => Object.fromEntries(fields.map((field, index) => [field, values[index]])) as Row,
      );
  };
  return {
    kind: "neo4j",
    query: (statement, parameters) => run(statement, parameters, "Read"),
    // Only the server's fixed memory statements use write mode; tools never do.
    write: (statement, parameters) => run(statement, parameters, "Write"),
  };
}
