import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import {
  ConfirmationSchema,
  type ConnectorState,
  GeneratedCampaignImageSchema,
  initialOrchestratorState,
  type OrchestratorState,
  PHASE_2_AUTONOMOUS_TOOLS,
  PHASE_2_CURATED_TOOLS,
} from "@northstar/contracts";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  type GenerateTextOnFinishCallback,
  streamText,
  type ToolSet,
  type UIMessage,
} from "ai";
import { createWorkersAI } from "workers-ai-provider";

export type AgentProps = { principalSubject: string; workspaceId: string };
type OrchestratorBindings = CloudflareBindings & {
  SALESFORCE_MCP_URL?: string;
  CONFIRMATION_SIGNING_KEY?: string;
};

const IMAGE_PROMPT_VERSION = "campaign-image-v1";
const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const IMAGE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

const SEMANTIC_FAILURE_PATTERN =
  /no business units|no (?:results|records|data)\b|cannot (?:access|summarize|find|retrieve)|can't (?:access|summarize|find|retrieve)|not (?:available|found)|permission denied|access denied/i;

function collectResultText(value: unknown, output: string[] = []): string[] {
  if (typeof value === "string") output.push(value);
  else if (Array.isArray(value))
    value.forEach((child) => {
      collectResultText(child, output);
    });
  else if (value && typeof value === "object")
    Object.values(value as Record<string, unknown>).forEach((child) => {
      collectResultText(child, output);
    });
  return output;
}

export function classifyToolResult(value: unknown): "success" | "unavailable" | "error" {
  if (value && typeof value === "object" && (value as { isError?: unknown }).isError === true)
    return "error";
  return SEMANTIC_FAILURE_PATTERN.test(collectResultText(value).join(" "))
    ? "unavailable"
    : "success";
}

export function selectRequiredTool(prompt: string, availableNames: string[]) {
  const requested = /\b(?:readiness|ready|blocker|risk)\b/i.test(prompt)
    ? "check_campaign_readiness"
    : /\b(?:summarize|summary|performance|campaign)\b/i.test(prompt) &&
        /\b(?:salesforce|campaign|701[a-zA-Z0-9]{12,15})\b/i.test(prompt)
      ? "summarize_campaign"
      : null;
  return requested
    ? availableNames.find((name) => name === requested || name.endsWith(`_${requested}`))
    : undefined;
}

export function requiredToolChoice(requiredTool: string | undefined, stepNumber: number) {
  if (!requiredTool) return undefined;
  return stepNumber === 0
    ? { toolChoice: { type: "tool" as const, toolName: requiredTool } }
    : { toolChoice: "none" as const };
}

function latestUserText(messages: Array<{ role: string; parts?: Array<unknown> }>) {
  const message = [...messages].reverse().find((candidate) => candidate.role === "user");
  if (!message?.parts) return "";
  return message.parts
    .filter((part): part is { type: "text"; text: string } =>
      Boolean(
        part &&
          typeof part === "object" &&
          (part as { type?: unknown }).type === "text" &&
          typeof (part as { text?: unknown }).text === "string",
      ),
    )
    .map((part) => part.text)
    .join(" ");
}

function guardToolResults(tools: ToolSet): ToolSet {
  return Object.fromEntries(
    Object.entries(tools).map(([name, definition]) => {
      if (!("execute" in definition) || typeof definition.execute !== "function")
        return [name, definition];
      const execute = definition.execute;
      return [
        name,
        {
          ...definition,
          execute: async (...args: Parameters<typeof execute>) => {
            const upstream = await resolveToolResult(execute(...args));
            const semanticStatus = classifyToolResult(upstream);
            return semanticStatus === "success"
              ? upstream
              : {
                  semanticStatus,
                  message:
                    semanticStatus === "error"
                      ? "Salesforce reported that the tool call failed. Do not infer missing facts."
                      : "Salesforce returned no usable business result. Do not infer missing facts.",
                  upstream,
                };
          },
        },
      ];
    }),
  );
}

export function validateImageConcept(value: unknown) {
  if (typeof value !== "string") return null;
  const concept = value.trim().replace(/\s+/g, " ");
  if (concept.length < 8 || concept.length > 280) return null;
  if (/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i.test(concept)) return null;
  if (/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/.test(concept)) return null;
  if (
    /ignore (?:all |any )?(?:previous|prior) instructions|system prompt|customer list/i.test(
      concept,
    )
  )
    return null;
  return concept;
}

function pngDimensions(bytes: Uint8Array) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 24 || signature.some((byte, index) => bytes[index] !== byte)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function decodeBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function json(value: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(value), { ...init, headers });
}

function connectorFromMcp(
  configured: boolean,
  mcp: ReturnType<MarketingOrchestrator["getMcpServers"]>,
): ConnectorState {
  if (!configured)
    return {
      id: "salesforce",
      label: "Salesforce agents",
      state: "not-configured",
      toolCount: 0,
      message: "The Salesforce MCP portal is not configured in this environment.",
    };
  const server = mcp.servers.salesforce;
  if (!server)
    return {
      id: "salesforce",
      label: "Salesforce agents",
      state: "disconnected",
      toolCount: 0,
      message: "Connect Salesforce to use the curated marketing agent catalog.",
    };
  const toolCount = mcp.tools.filter(
    (tool) =>
      tool.serverId === "salesforce" &&
      PHASE_2_CURATED_TOOLS.some((name) => tool.name === name || tool.name.endsWith(`_${name}`)),
  ).length;
  if (server.state === "ready")
    return {
      id: "salesforce",
      label: "Salesforce agents",
      state: "ready",
      toolCount,
      message: `${toolCount} curated Salesforce tools are available for this user.`,
    };
  if (
    server.state === "authenticating" ||
    server.state === "connecting" ||
    server.state === "connected" ||
    server.state === "discovering"
  )
    return {
      id: "salesforce",
      label: "Salesforce agents",
      state: "authenticating",
      toolCount,
      message:
        server.state === "authenticating"
          ? "Finish Salesforce authorization in the opened window."
          : "Salesforce is connected. Discovering the curated tool catalog…",
      ...(server.auth_url ? { authUrl: server.auth_url } : {}),
    };
  const failure = classifyMcpFailure(server.error);
  return {
    id: "salesforce",
    label: "Salesforce agents",
    state: server.state === "failed" ? failure.state : "disconnected",
    toolCount,
    message:
      server.state === "failed"
        ? failure.message
        : "Connect Salesforce to use the curated marketing agent catalog.",
    ...(server.state === "failed" ? { errorCode: failure.errorCode } : {}),
  };
}

export function classifyMcpFailure(
  error: string | null | undefined,
): Pick<ConnectorState, "state" | "message" | "errorCode"> {
  const normalized = error?.toLowerCase() ?? "";
  if (
    normalized.includes("expired") ||
    normalized.includes("invalid_grant") ||
    normalized.includes("token")
  )
    return {
      state: "expired",
      errorCode: "AUTH_REQUIRED",
      message: "Your Salesforce authorization expired. Reconnect to continue.",
    };
  if (
    normalized.includes("permission") ||
    normalized.includes("forbidden") ||
    normalized.includes("403")
  )
    return {
      state: "error",
      errorCode: "PERMISSION_DENIED",
      message: "Salesforce denied this user. Verify evaluator permissions, then reconnect.",
    };
  return {
    state: "error",
    errorCode: "UPSTREAM_UNAVAILABLE",
    message: "Salesforce authorization or tool discovery failed. Reconnect to recover.",
  };
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Bytes(value: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(value).buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256Hex(key: string, value: string) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(value));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function findToolField(value: unknown, field: string): unknown {
  if (!value || typeof value !== "object") return undefined;
  if (field in value) return (value as Record<string, unknown>)[field];
  for (const child of Object.values(value as Record<string, unknown>)) {
    const found = findToolField(child, field);
    if (found !== undefined) return found;
  }
  return undefined;
}

async function resolveToolResult(value: unknown) {
  if (value && typeof value === "object" && Symbol.asyncIterator in value) {
    let last: unknown;
    for await (const part of value as AsyncIterable<unknown>) last = part;
    return last;
  }
  return await Promise.resolve(value);
}

export class MarketingOrchestrator extends AIChatAgent<
  OrchestratorBindings,
  OrchestratorState,
  AgentProps
> {
  static options = { sendIdentityOnConnect: false };
  initialState = initialOrchestratorState;
  maxPersistedMessages = 100;
  waitForMcpConnections = false;
  private principalSubject = "unknown";
  private imageGenerationInFlight = false;

  private async productionChatResponse(
    messages: UIMessage[],
    abortSignal?: AbortSignal,
  ): Promise<Response> {
    await this.mcp.waitForConnections({ timeout: 3_000 });
    const discoveredTools = this.mcp.getAITools();
    const tools = guardToolResults(
      Object.fromEntries(
        Object.entries(discoveredTools).filter(([key]) =>
          PHASE_2_AUTONOMOUS_TOOLS.some((name) => key.endsWith(`_${name}`)),
        ),
      ),
    );
    const workersAI = createWorkersAI({
      binding: this.env.AI,
      gateway: { id: this.env.AI_GATEWAY_ID },
    });
    const workspaceReferences = this.state.tiles.map((tile) => ({
      kind: tile.kind,
      title: tile.title,
      recordRef: tile.recordRef,
      presentationStatus: tile.presentation?.sourceStatus,
    }));
    const requiredTool = selectRequiredTool(latestUserText(messages), Object.keys(tools));
    const result = streamText({
      model: workersAI(this.env.ORCHESTRATOR_MODEL),
      system: [
        "You are the Northstar marketing proof orchestrator.",
        "Salesforce tool results are the only authority for Salesforce facts. Protocol success does not mean that a business result exists.",
        "If a tool reports unavailable, empty, no business units, no records, or an error, explain that limitation and do not fill gaps from workspace presentation data.",
        "Never say you reviewed Salesforce unless a Salesforce tool returned usable evidence.",
        "Never claim a write, publish, send, or activation occurred. Keep customer PII out of responses.",
        "Return accessible plain text only. Do not use Markdown, HTML, tables, pipe characters, asterisks, or emoji. Use short paragraphs and hyphen-prefixed bullets when a list helps.",
        `Non-authoritative workspace record references: ${JSON.stringify(workspaceReferences)}`,
      ].join(" "),
      messages: await convertToModelMessages(messages),
      tools,
      ...(requiredTool
        ? {
            prepareStep: ({ stepNumber }: { stepNumber: number }) =>
              requiredToolChoice(requiredTool, stepNumber),
          }
        : {}),
      stopWhen: stepCountIs(4),
      timeout: 45_000,
      abortSignal,
    });
    return result.toUIMessageStreamResponse();
  }

  private async ensureImageDraftTable() {
    if ((this.env.ENVIRONMENT as string) !== "local") return;
    await this.env.APP_DB.exec(
      "CREATE TABLE IF NOT EXISTS campaign_image_drafts (image_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, principal_subject TEXT NOT NULL, campaign_id TEXT NOT NULL, channel TEXT NOT NULL, prompt_summary TEXT NOT NULL, prompt_version TEXT NOT NULL, model_id TEXT NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL, content_hash TEXT NOT NULL, r2_key TEXT NOT NULL UNIQUE, lifecycle TEXT NOT NULL, seed INTEGER, created_at TEXT NOT NULL, expires_at TEXT NOT NULL)",
    );
  }

  private async generateCampaignImage(request: Request) {
    if (this.imageGenerationInFlight)
      return json(
        { error: { code: "CONFLICT", message: "An image is already being generated." } },
        { status: 409 },
      );
    const body = (await request.json()) as {
      campaignId?: unknown;
      channel?: unknown;
      concept?: unknown;
      seed?: unknown;
    };
    if (typeof body.campaignId !== "string" || !/^[a-zA-Z0-9]{15,18}$/.test(body.campaignId))
      return json(
        { error: { code: "VALIDATION_FAILED", message: "Choose a valid campaign." } },
        { status: 400 },
      );
    if (body.channel !== "email" && body.channel !== "web" && body.channel !== "social")
      return json(
        { error: { code: "VALIDATION_FAILED", message: "Choose a supported channel." } },
        { status: 400 },
      );
    const concept = validateImageConcept(body.concept);
    if (!concept)
      return json(
        {
          error: {
            code: "VALIDATION_FAILED",
            message:
              "Use a short creative concept without contact details, customer data, or embedded instructions.",
          },
        },
        { status: 400 },
      );
    const seed =
      typeof body.seed === "number" && Number.isInteger(body.seed) && body.seed >= 0
        ? body.seed
        : undefined;
    await this.ensureImageDraftTable();
    const usage = await this.env.APP_DB.prepare(
      "SELECT COUNT(*) AS count FROM campaign_image_drafts WHERE workspace_id = ?",
    )
      .bind(this.state.workspaceId)
      .first<{ count: number }>();
    if ((usage?.count ?? 0) >= 100)
      return json(
        { error: { code: "RATE_LIMITED", message: "The 100-image proof cap has been reached." } },
        { status: 429 },
      );

    this.imageGenerationInFlight = true;
    try {
      const prompt = [
        "Create a polished square campaign image for the fictional Northstar outdoor lifestyle brand.",
        `Channel: ${body.channel}.`,
        `Creative concept: ${concept}.`,
        "Editorial photography, warm natural light, inclusive but no identifiable real person, no text, no logo, no product claims.",
      ].join(" ");
      const form = new FormData();
      form.append("prompt", prompt);
      form.append("width", String(1024));
      form.append("height", String(1024));
      if (seed !== undefined) form.append("seed", String(seed));
      const encoded = new Response(form);
      const result = await this.env.AI.run("@cf/black-forest-labs/flux-2-klein-4b", {
        multipart: {
          body: encoded.body ?? undefined,
          contentType: encoded.headers.get("content-type") ?? undefined,
        },
      });
      if (!result.image)
        return json(
          {
            error: { code: "UPSTREAM_UNAVAILABLE", message: "The image model returned no image." },
          },
          { status: 502 },
        );
      const bytes = decodeBase64(result.image);
      const dimensions = pngDimensions(bytes);
      if (
        bytes.byteLength > IMAGE_MAX_BYTES ||
        dimensions?.width !== 1024 ||
        dimensions.height !== 1024
      )
        return json(
          {
            error: {
              code: "UPSTREAM_UNAVAILABLE",
              message: "The generated image failed media validation.",
            },
          },
          { status: 502 },
        );
      const id = crypto.randomUUID();
      const contentHash = await sha256Bytes(bytes);
      const ownerHash = (await sha256(this.principalSubject)).slice(0, 24);
      const r2Key = `drafts/${this.state.workspaceId}/${ownerHash}/${id}.png`;
      const now = new Date();
      const expiresAt = new Date(now.getTime() + IMAGE_RETENTION_MS).toISOString();
      await this.env.CAMPAIGN_ASSETS.put(r2Key, bytes, {
        httpMetadata: { contentType: "image/png" },
        customMetadata: {
          campaignId: body.campaignId,
          lifecycle: "draft",
          expiresAt,
          promptVersion: IMAGE_PROMPT_VERSION,
        },
      });
      await this.env.APP_DB.prepare(
        `INSERT INTO campaign_image_drafts (
          image_id, workspace_id, principal_subject, campaign_id, channel, prompt_summary,
          prompt_version, model_id, width, height, content_hash, r2_key, lifecycle, seed,
          created_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
      )
        .bind(
          id,
          this.state.workspaceId,
          this.principalSubject,
          body.campaignId,
          body.channel,
          concept,
          IMAGE_PROMPT_VERSION,
          this.env.CAMPAIGN_IMAGE_MODEL,
          dimensions.width,
          dimensions.height,
          contentHash,
          r2Key,
          seed ?? null,
          now.toISOString(),
          expiresAt,
        )
        .run();
      return json(
        GeneratedCampaignImageSchema.parse({
          id,
          campaignId: body.campaignId,
          imageUrl: `/agent/images/${id}`,
          promptSummary: concept,
          channel: body.channel,
          width: dimensions.width,
          height: dimensions.height,
          contentHash,
          model: this.env.CAMPAIGN_IMAGE_MODEL,
          lifecycle: "draft",
          expiresAt,
        }),
        { status: 201 },
      );
    } finally {
      this.imageGenerationInFlight = false;
    }
  }

  private async serveCampaignImage(imageId: string) {
    await this.ensureImageDraftTable();
    const image = await this.env.APP_DB.prepare(
      `SELECT r2_key, expires_at FROM campaign_image_drafts
       WHERE image_id = ? AND workspace_id = ? AND principal_subject = ?`,
    )
      .bind(imageId, this.state.workspaceId, this.principalSubject)
      .first<{ r2_key: string; expires_at: string }>();
    if (!image || Date.parse(image.expires_at) <= Date.now())
      return json(
        { error: { code: "NOT_FOUND", message: "Image draft not found." } },
        { status: 404 },
      );
    const object = await this.env.CAMPAIGN_ASSETS.get(image.r2_key);
    if (!object)
      return json(
        { error: { code: "NOT_FOUND", message: "Image draft not found." } },
        { status: 404 },
      );
    return new Response(object.body, {
      headers: {
        "content-type": object.httpMetadata?.contentType ?? "image/png",
        "cache-control": "private, no-store",
        "content-security-policy": "default-src 'none'; sandbox",
      },
    });
  }

  override async onStart(props?: AgentProps) {
    await super.onStart(props);
    if (props?.principalSubject) this.principalSubject = props.principalSubject;
    const defaultTiles = new Map(initialOrchestratorState.tiles.map((tile) => [tile.id, tile]));
    const tiles = this.state.tiles.map((tile) => {
      const defaultTile = defaultTiles.get(tile.id);
      if (!defaultTile) return tile;
      const recordRef = defaultTile.recordRef ?? tile.recordRef;
      const presentation = defaultTile.presentation ?? tile.presentation;
      if (
        tile.recordRef?.recordId === recordRef?.recordId &&
        tile.presentation?.resourceUri === presentation?.resourceUri &&
        tile.presentation?.sourceStatus === presentation?.sourceStatus
      )
        return tile;
      return { ...tile, recordRef, presentation };
    });
    const liveCampaignId = initialOrchestratorState.tiles.find((tile) => tile.kind === "readiness")
      ?.recordRef?.recordId;
    const pendingConfirmation =
      this.state.pendingConfirmation?.recordId === liveCampaignId
        ? this.state.pendingConfirmation
        : null;
    if (
      tiles.some((tile, index) => tile !== this.state.tiles[index]) ||
      pendingConfirmation !== this.state.pendingConfirmation
    ) {
      this.setState({ ...this.state, tiles, pendingConfirmation });
    }
  }

  private syncConnector() {
    const connector = connectorFromMcp(Boolean(this.env.SALESFORCE_MCP_URL), this.getMcpServers());
    this.setState({
      ...this.state,
      connector,
      sourcesConnected:
        (this.env.ENVIRONMENT as string) === "local" ? 3 : connector.state === "ready" ? 3 : 0,
    });
    return connector;
  }

  private async recordConfirmationAudit(
    confirmation: ReturnType<typeof ConfirmationSchema.parse>,
    status: "pending" | "denied" | "expired" | "executed",
    sourceRecordId?: string,
  ) {
    if ((this.env.ENVIRONMENT as string) === "local")
      await this.env.APP_DB.exec(
        "CREATE TABLE IF NOT EXISTS confirmation_audit (confirmation_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, principal_subject TEXT NOT NULL, action TEXT NOT NULL, record_id TEXT NOT NULL, request_hash TEXT NOT NULL, idempotency_key TEXT NOT NULL UNIQUE, status TEXT NOT NULL, source_record_id TEXT, expires_at TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
      );
    const now = new Date().toISOString();
    await this.env.APP_DB.prepare(
      `INSERT INTO confirmation_audit (
        confirmation_id, workspace_id, principal_subject, action, record_id,
        request_hash, idempotency_key, status, source_record_id, expires_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(confirmation_id) DO UPDATE SET
        status = excluded.status,
        source_record_id = excluded.source_record_id,
        updated_at = excluded.updated_at`,
    )
      .bind(
        confirmation.id,
        this.state.workspaceId,
        confirmation.principalSubject,
        confirmation.action,
        confirmation.recordId,
        confirmation.requestHash,
        confirmation.idempotencyKey,
        status,
        sourceRecordId ?? null,
        confirmation.expiresAt,
        now,
        now,
      )
      .run();
  }

  override async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/diagnostics/chat") && request.method === "POST") {
      const body = (await request.json()) as { scenario?: unknown };
      if (body.scenario !== "campaign-summary")
        return json(
          { error: { code: "VALIDATION_FAILED", message: "Unknown diagnostic scenario." } },
          { status: 400 },
        );
      return this.productionChatResponse(
        [
          {
            id: crypto.randomUUID(),
            role: "user",
            parts: [
              {
                type: "text",
                text: "Summarize Salesforce Campaign 701jV000004GglIQAS using only live Salesforce evidence.",
              },
            ],
          },
        ],
        request.signal,
      );
    }
    if (url.pathname.endsWith("/images/generate") && request.method === "POST")
      return this.generateCampaignImage(request);
    const imageMatch = url.pathname.match(/\/images\/([a-f0-9-]{36})$/);
    if (imageMatch && request.method === "GET") return this.serveCampaignImage(imageMatch[1]);
    if (url.pathname.endsWith("/salesforce/status")) return json(this.syncConnector());
    if (url.pathname.endsWith("/salesforce/connect") && request.method === "POST") {
      const endpoint = this.env.SALESFORCE_MCP_URL;
      if (!endpoint)
        return json(
          { error: { code: "UPSTREAM_UNAVAILABLE", message: "Salesforce MCP is not configured." } },
          { status: 503 },
        );
      const existing = this.getMcpServers().servers.salesforce;
      if (existing) await this.removeMcpServer("salesforce");
      const result = await this.addMcpServer("Salesforce marketing", endpoint, {
        id: "salesforce",
        callbackHost: url.origin,
        callbackPath: "/agent/salesforce/callback",
        transport: { type: "streamable-http" },
      });
      const connector = this.syncConnector();
      return json({
        ...connector,
        ...(result.state === "authenticating" ? { authUrl: result.authUrl } : {}),
      });
    }
    if (url.pathname.endsWith("/salesforce/disconnect") && request.method === "POST") {
      if (this.getMcpServers().servers.salesforce) await this.removeMcpServer("salesforce");
      return json(this.syncConnector());
    }
    if (url.pathname.endsWith("/confirmations") && request.method === "POST") {
      const body = (await request.json()) as {
        action?: unknown;
        recordId?: unknown;
        summary?: unknown;
      };
      const action = body.action;
      const recordId = body.recordId;
      const summary = body.summary;
      if (
        (action !== "save-draft-campaign" && action !== "create-review-task") ||
        typeof recordId !== "string" ||
        !/^[a-zA-Z0-9]{15,18}$/.test(recordId) ||
        typeof summary !== "string" ||
        !summary.trim()
      )
        return json(
          { error: { code: "VALIDATION_FAILED", message: "The confirmation request is invalid." } },
          { status: 400 },
        );
      const id = crypto.randomUUID();
      const idempotencyKey = crypto.randomUUID();
      const requestHash = await sha256(
        JSON.stringify({
          action,
          recordId,
          summary: summary.trim(),
          principal: this.principalSubject,
        }),
      );
      const confirmation = ConfirmationSchema.parse({
        id,
        action,
        recordId,
        principalSubject: this.principalSubject,
        requestHash,
        idempotencyKey,
        summary: summary.trim(),
        expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
        status: "pending",
      });
      await this.recordConfirmationAudit(confirmation, "pending");
      this.setState({ ...this.state, pendingConfirmation: confirmation });
      return json(confirmation, { status: 201 });
    }
    if (url.pathname.endsWith("/confirmations/deny") && request.method === "POST") {
      const current = this.state.pendingConfirmation;
      if (!current)
        return json(
          { error: { code: "CONFLICT", message: "No confirmation is pending." } },
          { status: 409 },
        );
      const denied = { ...current, status: "denied" as const };
      await this.recordConfirmationAudit(current, "denied");
      this.setState({ ...this.state, pendingConfirmation: null });
      return json(denied);
    }
    if (url.pathname.endsWith("/confirmations/execute") && request.method === "POST") {
      const current = this.state.pendingConfirmation;
      if (!current)
        return json(
          { error: { code: "CONFLICT", message: "No confirmation is pending." } },
          { status: 409 },
        );
      if (current.principalSubject !== this.principalSubject)
        return json(
          {
            error: { code: "PERMISSION_DENIED", message: "Only the requesting user can confirm." },
          },
          { status: 403 },
        );
      if (Date.parse(current.expiresAt) <= Date.now()) {
        await this.recordConfirmationAudit(current, "expired");
        this.setState({ ...this.state, pendingConfirmation: null });
        return json(
          { error: { code: "CONFIRMATION_REQUIRED", message: "The confirmation expired." } },
          { status: 409 },
        );
      }
      if ((this.env.ENVIRONMENT as string) !== "local") {
        const signingKey = this.env.CONFIRMATION_SIGNING_KEY;
        if (!signingKey)
          return json(
            {
              error: {
                code: "UPSTREAM_UNAVAILABLE",
                message: "Signed confirmation execution is not configured.",
              },
            },
            { status: 503 },
          );
        await this.mcp.waitForConnections({ timeout: 5_000 });
        const tools = this.mcp.getAITools();
        const toolName =
          current.action === "create-review-task"
            ? "create_campaign_review_request"
            : "save_campaign_brief";
        const entry = Object.entries(tools).find(([key]) => key.endsWith(`_${toolName}`));
        const tool = entry?.[1];
        if (!tool || !("execute" in tool) || typeof tool.execute !== "function")
          return json(
            {
              error: {
                code: "UPSTREAM_UNAVAILABLE",
                message:
                  "The confirmed Salesforce review tool is unavailable. Reconnect and retry.",
              },
            },
            { status: 503 },
          );
        const confirmationExpiresAt = Math.floor(Date.parse(current.expiresAt) / 1000);
        const canonicalConfirmation = [
          current.action,
          current.recordId,
          current.id,
          current.requestHash,
          current.idempotencyKey,
          String(confirmationExpiresAt),
          current.principalSubject,
        ].join("\n");
        const confirmationSignature = await hmacSha256Hex(signingKey, canonicalConfirmation);
        const principalHex = [...new TextEncoder().encode(current.principalSubject)]
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("");
        const signedConfirmation = [
          "v1",
          current.id,
          String(confirmationExpiresAt),
          principalHex,
          confirmationSignature,
        ].join(".");
        let upstream: unknown;
        try {
          upstream = await resolveToolResult(
            tool.execute(
              {
                inputs: [
                  {
                    campaignId: current.recordId,
                    ...(current.action === "save-draft-campaign" ? { brief: current.summary } : {}),
                    confirmationId: signedConfirmation,
                    requestHash: current.requestHash,
                    idempotencyKey: current.idempotencyKey,
                  },
                ],
              },
              { toolCallId: current.id, messages: [], context: undefined },
            ),
          );
        } catch {
          return json(
            {
              error: {
                code: "UPSTREAM_UNAVAILABLE",
                message:
                  "Salesforce rejected the confirmed write. The request was not recorded as executed; reconnect or ask an administrator to verify the confirmation configuration, then retry.",
              },
            },
            { status: 502 },
          );
        }
        const campaignId = findToolField(upstream, "campaignId");
        const readBack = findToolField(upstream, "readBack");
        const sourceRecordId =
          current.action === "create-review-task" ? findToolField(upstream, "taskId") : campaignId;
        const taskDetails =
          current.action === "create-review-task"
            ? {
                subject: findToolField(upstream, "subject"),
                priority: findToolField(upstream, "priority"),
                dueDate: findToolField(upstream, "dueDate"),
                description: findToolField(upstream, "description"),
              }
            : {};
        if (
          typeof sourceRecordId !== "string" ||
          campaignId !== current.recordId ||
          readBack !== true ||
          (current.action === "create-review-task" &&
            (typeof taskDetails.subject !== "string" ||
              typeof taskDetails.priority !== "string" ||
              typeof taskDetails.dueDate !== "string" ||
              typeof taskDetails.description !== "string"))
        )
          return json(
            {
              error: {
                code: "CONFLICT",
                message: "Salesforce did not return the required authoritative read-back.",
              },
            },
            { status: 409 },
          );
        const executed = { ...current, status: "executed" as const };
        await this.recordConfirmationAudit(current, "executed", sourceRecordId);
        this.setState({
          ...this.state,
          pendingConfirmation: null,
          activity: [
            {
              id: `${current.action}-${sourceRecordId}`,
              label:
                current.action === "create-review-task"
                  ? "Review request created"
                  : "Draft campaign brief saved",
              detail: `Salesforce read-back · ${sourceRecordId}`,
              occurredAt: "Now",
              status: "complete",
            },
            ...this.state.activity,
          ],
        });
        return json({
          confirmation: executed,
          result: {
            source: "salesforce",
            recordId: sourceRecordId,
            campaignId,
            status: findToolField(upstream, "status"),
            ...taskDetails,
            idempotencyKey: current.idempotencyKey,
            readBack: true,
          },
        });
      }
      const executed = { ...current, status: "executed" as const };
      const fixtureRecordId =
        current.action === "create-review-task" ? "00T000000000001" : current.recordId;
      await this.recordConfirmationAudit(current, "executed", fixtureRecordId);
      this.setState({
        ...this.state,
        pendingConfirmation: null,
        activity: [
          {
            id: `${current.action}-${current.id}`,
            label:
              current.action === "create-review-task"
                ? "Review request created"
                : "Draft campaign brief saved",
            detail: `Local fixture read-back · ${current.recordId}`,
            occurredAt: "Now",
            status: "complete",
          },
          ...this.state.activity,
        ],
      });
      return json({
        confirmation: executed,
        result: {
          source: "local-fixture",
          recordId: fixtureRecordId,
          campaignId: current.recordId,
          status: "Open",
          ...(current.action === "create-review-task"
            ? {
                subject: "Review campaign readiness: VERO Phase 1 Launch",
                priority: "High",
                dueDate: new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10),
                description:
                  "Campaign context, readiness findings, and a human review checklist were recorded in Salesforce.",
              }
            : {}),
          idempotencyKey: current.idempotencyKey,
          readBack: true,
        },
      });
    }
    const response = await super.onRequest(request);
    return (
      response ??
      json({ error: { code: "NOT_FOUND", message: "Agent endpoint not found." } }, { status: 404 })
    );
  }

  async onChatMessage(
    _onFinish: GenerateTextOnFinishCallback<ToolSet>,
    options?: OnChatMessageOptions,
  ): Promise<Response> {
    if (options?.abortSignal?.aborted) return new Response(null, { status: 499 });
    if ((this.env.ENVIRONMENT as string) !== "local") {
      return this.productionChatResponse(this.messages, options?.abortSignal);
    }
    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const id = crypto.randomUUID();
        writer.write({ type: "text-start", id });
        for (const text of [
          "I reviewed the fictional Northstar sample campaign. ",
          "The strongest signal is stable engagement, while accessibility copy and the commercial-consent scope remain the two readiness blockers. ",
          "I have not changed, published, or sent anything.",
        ]) {
          if (options?.abortSignal?.aborted) break;
          writer.write({ type: "text-delta", id, delta: text });
        }
        writer.write({ type: "text-end", id });
      },
    });
    return createUIMessageStreamResponse({ stream });
  }
}
