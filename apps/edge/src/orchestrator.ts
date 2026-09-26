import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import {
  type Confirmation,
  ConfirmationSchema,
  type ConnectorState,
  classifyPolicyIntent,
  currentFocusVersion,
  emptyWorkingSet,
  type FocusItem,
  GeneratedCampaignImageSchema,
  initialOrchestratorState,
  type OrchestratorState,
  PHASE_2_AUTONOMOUS_TOOLS,
  PHASE_2_CURATED_TOOLS,
  PROOF_DEFAULTS,
  parseOperationControls,
  policyResponse,
  referentFromReply,
  TURN_HISTORY_RETENTION_DAYS,
  type TurnRecord,
  TurnRecordSchema,
  WRITE_TOOL_BY_ACTION,
} from "@northstar/contracts";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type GenerateTextOnFinishCallback,
  stepCountIs,
  streamText,
  type ToolSet,
  type UIMessage,
  type UIMessageChunk,
  wrapLanguageModel,
} from "ai";
import { createWorkersAI } from "workers-ai-provider";
import {
  CAMPAIGN_CONTEXT_TOOL_PREFIX,
  connectCampaignContextTools,
} from "./campaign-context/server";
import { applyFocusUpdate, type FocusInput, focusBriefText, focusTools } from "./focus";
import { forcedToolCallMiddleware } from "./forced-tool-middleware";
import {
  connectKnowledgeGraphTools,
  KNOWLEDGE_GRAPH_TOOL_PREFIX,
  knowledgeGraphBackend,
} from "./knowledge-graph/server";
import { buildTurnRecord } from "./turn-history";
import {
  isRevisionRequest,
  MAX_OUTPUT_TOKENS,
  MAX_TURN_STEPS,
  missingPlannedTool,
  orchestratorSystemPrompt,
  selectToolPlan,
  stepToolChoice,
  TURN_TIMEOUT,
} from "./turn-policy";
import { createTurnTracer, describeTurnError, type TurnRoute } from "./turn-trace";
import { addCreatedRecord, ingestToolResult, openCampaign, workingSetPrompt } from "./working-set";

export {
  requestedToolName,
  requiredToolChoice,
  selectRequiredTool,
  stepToolChoice,
} from "./turn-policy";

export type AgentProps = { principalSubject: string; workspaceId: string };
type OrchestratorBindings = CloudflareBindings & {
  SALESFORCE_MCP_URL?: string;
  CONFIRMATION_SIGNING_KEY?: string;
  // Operator kill switches, set as Worker secrets so deploys do not reset them.
  WRITES_ENABLED?: string;
  DISABLED_TOOLS?: string;
  // Neo4j Aura Query API credentials (Worker secrets); without them the fixture graph is used.
  NEO4J_QUERY_URL?: string;
  NEO4J_USERNAME?: string;
  NEO4J_PASSWORD?: string;
};

const IMAGE_PROMPT_VERSION = "campaign-image-v1";
const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
// Matches the Apex attachment limit, which keeps the decoded image inside the synchronous heap.
const ATTACH_MAX_BYTES = 3 * 1024 * 1024;
const ACTIVITY_LABELS = {
  "create-review-task": "Review request created",
  "save-draft-campaign": "Draft campaign brief saved",
  "attach-generated-image": "Campaign image attached",
} as const;
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

export function evidenceTurnMessages(messages: UIMessage[]): UIMessage[] {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user") return [message];
  }
  return [];
}

/** Most recent messages sent to the model, so follow-up requests keep the conversation's context. */
export const CONVERSATION_WINDOW = 8;

/**
 * The bounded conversation for a model turn. Earlier assistant replies keep only their text:
 * stale tool results, reasoning, and trace data never re-enter the prompt, and the system policy
 * tells the model that earlier replies are context, not Salesforce evidence (see WU-030).
 */
export function conversationWindow(
  messages: UIMessage[],
  maxMessages = CONVERSATION_WINDOW,
): UIMessage[] {
  let lastUser = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1)
    if (messages[index]?.role === "user") {
      lastUser = index;
      break;
    }
  if (lastUser < 0) return [];
  const window = messages.slice(Math.max(0, lastUser - maxMessages + 1), lastUser + 1);
  const firstUser = window.findIndex((message) => message.role === "user");
  return window.slice(firstUser).flatMap((message, index, all): UIMessage[] => {
    if (message.role === "user") return [message];
    if (message.role !== "assistant" || index === all.length - 1) return [];
    const parts = message.parts.filter(
      (part) => part.type === "text" && part.text.trim().length > 0,
    );
    return parts.length ? [{ ...message, parts }] : [];
  });
}

/** Fixture tool results for local development, shaped like Salesforce agent replies. */
const LOCAL_FIXTURE_RESULTS: Array<[string, unknown]> = [
  [
    "summarize_campaign",
    {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            source: "local-fixture",
            campaignId: "701jV000004GglIQAS",
            summary:
              "Fall Loyalty Reactivation is in progress; engagement is 8.4 percent above its four-week baseline.",
            openRate: "38.2%",
            clickRate: "6.7%",
          }),
        },
      ],
    },
  ],
  [
    "check_campaign_readiness",
    {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            source: "local-fixture",
            campaignId: "701jV000004GglIQAS",
            summary: "7 of 9 readiness checks pass; 2 blockers remain before review.",
            blockers: "Accessibility copy; commercial-consent scope",
          }),
        },
      ],
    },
  ],
];

/**
 * Local development's stand-in for the model's drafting: a fictional push draft for a drafting
 * request, and its next version for a revision of the focus.
 */
function localFixtureDraft(utterance: string, focus: FocusItem | null): FocusInput | null {
  const drafting =
    /\b(?:draft|write)\b/i.test(utterance) &&
    /\b(?:push|message|notification|email|brief|content)\b/i.test(utterance);
  const revising = Boolean(focus) && isRevisionRequest(utterance);
  if (!drafting && !revising) return null;
  const draft: FocusInput = {
    kind: "push-message",
    title: "Rainy-day comfort: Spicy Tortilla Soup",
    summary:
      "Lunch push for Coastline app users in Los Angeles, built from the weather and past rainy-day results (fictional fixture).",
    fields: [
      { label: "Headline", value: "Rain outside? Soup's on." },
      {
        label: "Body",
        value:
          "Warm up with Spicy Tortilla Soup, ready in minutes at Coastline Kitchen Arts District.",
      },
      { label: "Send time", value: "11:15 a.m. local" },
      { label: "Audience", value: "Coastline app · Los Angeles (push opt-ins)" },
      { label: "Channel", value: "Mobile app push" },
    ],
    changeNote: "First draft from the fixture context",
  };
  if (!drafting && focus) {
    const current = currentFocusVersion(focus);
    return {
      kind: focus.kind,
      title: current.title,
      summary: current.summary,
      fields: current.fields.map((field) =>
        field.label === "Headline"
          ? { ...field, value: "Rain outside? Warm soup is waiting." }
          : field,
      ),
      changeNote: utterance.trim().slice(0, 240),
    };
  }
  return draft;
}

type ToolResultListener = (toolName: string, input: unknown, output: unknown) => void;

function guardToolResults(tools: ToolSet, onResult?: ToolResultListener): ToolSet {
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
            // Successful results feed the chat's working set; a listener error never fails the tool.
            if (semanticStatus === "success")
              try {
                onResult?.(name, args[0], upstream);
              } catch (error) {
                console.error("[orchestrator] working-set ingestion failed", error);
              }
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

function encodeBase64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
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

/** A scripted turn with no model call, used for the local fixture and policy responses. */
function scriptedTurnStream(
  texts: string[],
  { reasoning, abortSignal }: { reasoning?: string; abortSignal?: AbortSignal } = {},
): ReadableStream<UIMessageChunk> {
  const reasoningId = crypto.randomUUID();
  const textId = crypto.randomUUID();
  const chunks: UIMessageChunk[] = [
    { type: "start" },
    { type: "start-step" },
    ...(reasoning
      ? ([
          { type: "reasoning-start", id: reasoningId },
          { type: "reasoning-delta", id: reasoningId, delta: reasoning },
          { type: "reasoning-end", id: reasoningId },
        ] satisfies UIMessageChunk[])
      : []),
    { type: "text-start", id: textId },
    ...texts.map((delta) => ({ type: "text-delta" as const, id: textId, delta })),
    { type: "text-end", id: textId },
    { type: "finish-step" },
    { type: "finish", finishReason: "stop" },
  ];
  return new ReadableStream({
    pull(controller) {
      const next = chunks.shift();
      if (!next || abortSignal?.aborted) controller.close();
      else controller.enqueue(next);
    },
  });
}

const POLICY_ROUTER = "Northstar policy router";
const TURN_HISTORY_LIMIT = 200;
type TurnPipeResult = Awaited<ReturnType<ReturnType<typeof createTurnTracer>["pipe"]>>;

function scriptedResponse(
  texts: string[],
  options: {
    model: string;
    route?: TurnRoute;
    reasoning?: string;
    abortSignal?: AbortSignal;
    onComplete?: (result: TurnPipeResult) => Promise<void>;
  },
) {
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const tracer = createTurnTracer(writer, {
        model: options.model,
        toolCount: 0,
        timeoutSeconds: TURN_TIMEOUT.totalMs / 1000,
        userAbortSignal: options.abortSignal,
        ...(options.route ? { route: options.route } : {}),
      });
      const result = await tracer.pipe(
        scriptedTurnStream(texts, {
          reasoning: options.reasoning,
          abortSignal: options.abortSignal,
        }),
      );
      await options.onComplete?.(result);
    },
    onError: describeTurnError,
  });
  return createUIMessageStreamResponse({ stream });
}

export function writeBlockReason(
  controls: ReturnType<typeof parseOperationControls>,
  action: keyof typeof WRITE_TOOL_BY_ACTION,
) {
  if (!controls.writesEnabled)
    return "Salesforce writes are paused by an operator. Nothing was changed.";
  if ((controls.disabledTools as readonly string[]).includes(WRITE_TOOL_BY_ACTION[action]))
    return "This Salesforce write is turned off by an operator. Nothing was changed.";
  return null;
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
    const turnMessages = conversationWindow(messages);
    await this.mcp.waitForConnections({ timeout: 10_000 });
    const discoveredTools = this.mcp.getAITools();
    const { disabledTools } = parseOperationControls(this.env);
    // The campaign-context and knowledge-graph MCPs run in-process; both close when the turn ends.
    const context = await connectCampaignContextTools();
    const graph = await connectKnowledgeGraphTools(knowledgeGraphBackend(this.env));
    const tools = guardToolResults(
      {
        ...Object.fromEntries(
          Object.entries(discoveredTools).filter(([key]) =>
            PHASE_2_AUTONOMOUS_TOOLS.some(
              (name) => key.endsWith(`_${name}`) && !disabledTools.includes(name),
            ),
          ),
        ),
        ...Object.fromEntries(
          Object.entries(graph.tools).filter(
            ([key]) =>
              !(disabledTools as readonly string[]).includes(
                key.slice(KNOWLEDGE_GRAPH_TOOL_PREFIX.length),
              ),
          ),
        ),
        ...Object.fromEntries(
          Object.entries(context.tools).filter(
            ([key]) =>
              !(disabledTools as readonly string[]).includes(
                key.slice(CAMPAIGN_CONTEXT_TOOL_PREFIX.length),
              ),
          ),
        ),
      },
      (name, input, output) => this.ingestToolResult(name, input, output),
    );
    // The local focus tool changes only the workspace draft.
    if (!(disabledTools as readonly string[]).includes("update_focus"))
      Object.assign(
        tools,
        focusTools((input) => this.updateFocus(input)),
      );
    const planContext = { hasFocus: Boolean(this.state.workingSet.focus) };
    const workersAI = createWorkersAI({
      binding: this.env.AI,
      gateway: { id: this.env.AI_GATEWAY_ID },
    });
    const workspace = workingSetPrompt(this.state.workingSet);
    const prompt = latestUserText(turnMessages);
    const toolPlan = selectToolPlan(prompt, Object.keys(tools), planContext);
    // Readable plan for the trace and history, such as "a → b → c".
    const requiredTool = toolPlan?.join(" → ");
    const missingTool = missingPlannedTool(prompt, Object.keys(tools), planContext);
    if (missingTool) {
      await context.close();
      await graph.close();
      return scriptedResponse(
        [
          (disabledTools as readonly string[]).includes(missingTool)
            ? `The ${missingTool.replaceAll("_", " ")} tool is turned off by an operator right now, so I did not call it or substitute demo data.`
            : "Salesforce is connected, but the governed tool catalog is not ready for this request. Check the Salesforce connection status and retry. I did not substitute demo data.",
        ],
        {
          model: POLICY_ROUTER,
          route: "catalog-unavailable",
          abortSignal,
          onComplete: (result) =>
            this.recordTurn(prompt, { model: POLICY_ROUTER, route: "catalog-unavailable" }, result),
        },
      );
    }
    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const tracer = createTurnTracer(writer, {
          model: PROOF_DEFAULTS.orchestratorModel,
          toolCount: Object.keys(tools).length,
          requiredTool,
          route: "model",
          timeoutSeconds: TURN_TIMEOUT.totalMs / 1000,
          userAbortSignal: abortSignal,
        });
        try {
          const result = streamText({
            model: wrapLanguageModel({
              model: workersAI(PROOF_DEFAULTS.orchestratorModel),
              middleware: forcedToolCallMiddleware,
            }),
            system: orchestratorSystemPrompt(workspace, toolPlan),
            messages: await convertToModelMessages(turnMessages),
            tools,
            prepareStep: ({ stepNumber }: { stepNumber: number }) =>
              stepToolChoice(toolPlan, stepNumber),
            stopWhen: stepCountIs(MAX_TURN_STEPS),
            maxOutputTokens: MAX_OUTPUT_TOKENS,
            timeout: TURN_TIMEOUT,
            abortSignal,
            onStepFinish: (step) => tracer.recordStepFinish(step),
            onError: ({ error }) => console.error("[orchestrator] turn stream error", error),
          });
          const turn = await tracer.pipe(
            result.toUIMessageStream({ sendReasoning: true, onError: describeTurnError }),
          );
          if (turn.outcome !== "completed")
            console.warn(`[orchestrator] turn ended with outcome ${turn.outcome}`);
          await this.recordTurn(
            prompt,
            { model: PROOF_DEFAULTS.orchestratorModel, route: "model", requiredTool },
            turn,
          );
        } catch (error) {
          console.error("[orchestrator] turn setup failed", error);
          const turn = await tracer.pipe(
            new ReadableStream({
              start(controller) {
                controller.error(error);
              },
            }),
          );
          await this.recordTurn(
            prompt,
            { model: PROOF_DEFAULTS.orchestratorModel, route: "model", requiredTool },
            turn,
          );
        } finally {
          await context.close();
          await graph.close();
        }
      },
      onError: describeTurnError,
    });
    return createUIMessageStreamResponse({ stream });
  }

  /** Returns a 503 response when operators have paused writes or turned off this write tool. */
  private writeBlocked(action: keyof typeof WRITE_TOOL_BY_ACTION) {
    const message = writeBlockReason(parseOperationControls(this.env), action);
    return message ? json({ error: { code: "WRITES_DISABLED", message } }, { status: 503 }) : null;
  }

  /** Labels what a follow-up refers to, from the assistant reply before the latest message. */
  private previousReplyReferent() {
    const window = conversationWindow(this.messages);
    const previous = [...window].reverse().find((message) => message.role === "assistant");
    const text = previous?.parts
      .map((part) => (part.type === "text" ? part.text : ""))
      .join("")
      .trim();
    return text ? referentFromReply(text) : null;
  }

  private ensureTurnHistory() {
    this.sql`CREATE TABLE IF NOT EXISTS northstar_turn_history (
      id TEXT PRIMARY KEY,
      started_at INTEGER NOT NULL,
      record TEXT NOT NULL
    )`;
  }

  /** Stores one turn in this user's agent storage; history never blocks or fails the turn. */
  private async recordTurn(
    utterance: string,
    context: { model: string; route: TurnRecord["route"]; requiredTool?: string },
    result: TurnPipeResult,
  ) {
    try {
      const record = TurnRecordSchema.parse(buildTurnRecord({ utterance, ...context, result }));
      this.ensureTurnHistory();
      this.sql`INSERT INTO northstar_turn_history (id, started_at, record)
        VALUES (${record.id}, ${Date.parse(record.startedAt)}, ${JSON.stringify(record)})`;
      const cutoff = Date.now() - TURN_HISTORY_RETENTION_DAYS * 86_400_000;
      this.sql`DELETE FROM northstar_turn_history WHERE started_at < ${cutoff}`;
      this.sql`DELETE FROM northstar_turn_history WHERE id NOT IN (
        SELECT id FROM northstar_turn_history ORDER BY started_at DESC LIMIT ${TURN_HISTORY_LIMIT}
      )`;
    } catch (error) {
      console.error("[orchestrator] could not record turn history", error);
    }
  }

  /** A compact, per-user export of confirmed-write audit rows and turn summaries in retention. */
  private async exportAudit() {
    const cutoff = new Date(Date.now() - TURN_HISTORY_RETENTION_DAYS * 86_400_000).toISOString();
    let confirmations: Record<string, unknown>[] = [];
    try {
      const rows = await this.env.APP_DB.prepare(
        `SELECT confirmation_id, action, record_id, status, source_record_id, expires_at, created_at, updated_at
         FROM confirmation_audit
         WHERE workspace_id = ? AND principal_subject = ? AND created_at >= ?
         ORDER BY created_at DESC LIMIT 500`,
      )
        .bind(this.state.workspaceId, this.principalSubject, cutoff)
        .all<Record<string, unknown>>();
      confirmations = rows.results;
    } catch {
      // The audit table is created on first write; no rows means no confirmed writes yet.
    }
    const exportedAt = new Date().toISOString();
    return new Response(
      JSON.stringify(
        {
          exportedAt,
          workspaceId: this.state.workspaceId,
          retentionDays: TURN_HISTORY_RETENTION_DAYS,
          operations: parseOperationControls(this.env),
          confirmations,
          turns: this.listTurns().map((turn) => ({
            id: turn.id,
            startedAt: turn.startedAt,
            utterance: turn.utterance,
            route: turn.route,
            requiredTool: turn.requiredTool,
            outcome: turn.outcome,
            fallback: turn.fallback,
            durationMs: turn.durationMs,
            tools: turn.tools.map((tool) => ({ toolName: tool.toolName, status: tool.status })),
          })),
        },
        null,
        2,
      ),
      {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          "content-disposition": `attachment; filename="northstar-audit-${exportedAt.slice(0, 10)}.json"`,
        },
      },
    );
  }

  private listTurns(): TurnRecord[] {
    this.ensureTurnHistory();
    const cutoff = Date.now() - TURN_HISTORY_RETENTION_DAYS * 86_400_000;
    return this.sql<{ record: string }>`SELECT record FROM northstar_turn_history
      WHERE started_at >= ${cutoff} ORDER BY started_at DESC LIMIT ${TURN_HISTORY_LIMIT}`.flatMap(
      (row) => {
        const parsed = TurnRecordSchema.safeParse(JSON.parse(row.record));
        return parsed.success ? [parsed.data] : [];
      },
    );
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

  private async findImageDraft(imageId: string) {
    if (!/^[a-f0-9-]{36}$/.test(imageId)) return null;
    await this.ensureImageDraftTable();
    const draft = await this.env.APP_DB.prepare(
      `SELECT image_id, campaign_id, channel, prompt_summary, content_hash, r2_key, lifecycle, expires_at
       FROM campaign_image_drafts
       WHERE image_id = ? AND workspace_id = ? AND principal_subject = ?`,
    )
      .bind(imageId, this.state.workspaceId, this.principalSubject)
      .first<{
        image_id: string;
        campaign_id: string;
        channel: string;
        prompt_summary: string;
        content_hash: string;
        r2_key: string;
        lifecycle: string;
        expires_at: string;
      }>();
    return draft && Date.parse(draft.expires_at) > Date.now() ? draft : null;
  }

  /** Loads the confirmed draft from R2 and re-verifies it against the hash bound into the confirmation. */
  private async loadConfirmedImage(
    confirmation: ReturnType<typeof ConfirmationSchema.parse>,
  ): Promise<
    { imageBase64: string; contentHash: string; title: string; altText: string } | { error: string }
  > {
    const draft = confirmation.imageId ? await this.findImageDraft(confirmation.imageId) : null;
    if (
      draft?.lifecycle !== "draft" ||
      draft.campaign_id !== confirmation.recordId ||
      draft.content_hash !== confirmation.contentHash
    )
      return { error: "The confirmed image draft is no longer available. Generate it again." };
    const object = await this.env.CAMPAIGN_ASSETS.get(draft.r2_key);
    if (!object) return { error: "The confirmed image draft is no longer available." };
    const bytes = new Uint8Array(await object.arrayBuffer());
    if (bytes.byteLength > ATTACH_MAX_BYTES)
      return { error: "The image is larger than the Salesforce attachment limit." };
    if ((await sha256Bytes(bytes)) !== confirmation.contentHash)
      return { error: "The stored image no longer matches the confirmed content hash." };
    return {
      imageBase64: encodeBase64(bytes),
      contentHash: draft.content_hash,
      title: `Northstar ${draft.channel} campaign image`,
      altText: `Generated campaign image: ${draft.prompt_summary}`,
    };
  }

  /** Lists this user's unexpired variants for a campaign, newest first, for review and selection. */
  private async listImageDrafts(campaignId: string | null) {
    if (!campaignId || !/^[a-zA-Z0-9]{15,18}$/.test(campaignId)) return [];
    await this.ensureImageDraftTable();
    const rows = await this.env.APP_DB.prepare(
      `SELECT image_id, campaign_id, channel, prompt_summary, model_id, width, height, content_hash,
         lifecycle, expires_at
       FROM campaign_image_drafts
       WHERE workspace_id = ? AND principal_subject = ? AND campaign_id = ? AND expires_at > ?
       ORDER BY created_at DESC LIMIT 24`,
    )
      .bind(this.state.workspaceId, this.principalSubject, campaignId, new Date().toISOString())
      .all<{
        image_id: string;
        campaign_id: string;
        channel: string;
        prompt_summary: string;
        model_id: string;
        width: number;
        height: number;
        content_hash: string;
        lifecycle: string;
        expires_at: string;
      }>();
    return rows.results.flatMap((row) => {
      const parsed = GeneratedCampaignImageSchema.safeParse({
        id: row.image_id,
        campaignId: row.campaign_id,
        imageUrl: `/agent/images/${row.image_id}`,
        promptSummary: row.prompt_summary,
        channel: row.channel,
        width: row.width,
        height: row.height,
        contentHash: row.content_hash,
        model: row.model_id,
        lifecycle: row.lifecycle,
        expiresAt: row.expires_at,
      });
      return parsed.success ? [parsed.data] : [];
    });
  }

  private async rejectImageDraft(imageId: string) {
    const draft = await this.findImageDraft(imageId);
    if (draft?.lifecycle !== "draft")
      return json(
        {
          error: {
            code: "CONFLICT",
            message: "Only an unexpired, unattached draft can be rejected.",
          },
        },
        { status: 409 },
      );
    if (this.state.pendingConfirmation?.imageId === imageId)
      return json(
        {
          error: {
            code: "CONFLICT",
            message: "Cancel the pending attachment before rejecting it.",
          },
        },
        { status: 409 },
      );
    await this.env.APP_DB.prepare(
      "UPDATE campaign_image_drafts SET lifecycle = 'rejected' WHERE image_id = ? AND workspace_id = ?",
    )
      .bind(imageId, this.state.workspaceId)
      .run();
    return json({ id: imageId, lifecycle: "rejected" });
  }

  private async markImageAttached(imageId: string) {
    await this.env.APP_DB.prepare(
      "UPDATE campaign_image_drafts SET lifecycle = 'attached' WHERE image_id = ? AND workspace_id = ?",
    )
      .bind(imageId, this.state.workspaceId)
      .run();
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
    // State saved before the working set existed carries static tiles; start it fresh instead.
    const saved = this.state as OrchestratorState & { tiles?: unknown };
    if (!saved.workingSet || "tiles" in saved) {
      const { tiles: _tiles, ...rest } = saved;
      this.setState({ ...rest, workingSet: emptyWorkingSet(), pendingConfirmation: null });
    }
    // Working sets saved before the focus existed have no focus field.
    else if (saved.workingSet.focus === undefined)
      this.setState({ ...saved, workingSet: { ...saved.workingSet, focus: null } });
  }

  /** Saves a draft (or its revision) as the workspace focus. */
  private updateFocus(input: FocusInput) {
    const workingSet = applyFocusUpdate(this.state.workingSet, input, new Date());
    this.setState({ ...this.state, workingSet });
    return workingSet.focus as FocusItem;
  }

  /** The focus draft's title, which the policy reply names when there is one. */
  private focusReferent() {
    const focus = this.state.workingSet.focus;
    return focus ? currentFocusVersion(focus).title : null;
  }

  /** Adds what a tool returned to the chat's working set. */
  private ingestToolResult(toolName: string, input: unknown, output: unknown) {
    const next = ingestToolResult(this.state.workingSet, {
      toolName,
      input,
      output,
      at: new Date(),
    });
    if (next !== this.state.workingSet) this.setState({ ...this.state, workingSet: next });
  }

  /** The working set with the record a confirmed write created. */
  private withCreatedRecord(action: Confirmation["action"], recordId: string, title?: string) {
    const objectType =
      action === "create-review-task"
        ? "Task"
        : action === "attach-generated-image"
          ? "ContentDocument"
          : "Campaign";
    return addCreatedRecord(
      this.state.workingSet,
      {
        system: "salesforce",
        objectType,
        recordId,
        title:
          (action === "save-draft-campaign"
            ? this.state.workingSet.records.find((record) => record.recordId === recordId)?.title
            : title) ?? `${ACTIVITY_LABELS[action]} ${recordId}`,
      },
      WRITE_TOOL_BY_ACTION[action],
      new Date(),
      action === "save-draft-campaign" ? "updated" : "created",
    );
  }

  /** A new chat starts with an empty workspace; a pending confirmation belongs to the old one. */
  private resetWorkingSet() {
    // Activity belongs to the chat too; the History view and audit export keep the full record.
    this.setState({
      ...this.state,
      workingSet: emptyWorkingSet(),
      pendingConfirmation: null,
      activity: [],
    });
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
    if (url.pathname.endsWith("/operations") && request.method === "GET")
      return json({
        ...parseOperationControls(this.env),
        knowledgeGraph: knowledgeGraphBackend(this.env).kind,
      });
    if (url.pathname.endsWith("/audit/export") && request.method === "GET")
      return this.exportAudit();
    if (url.pathname.endsWith("/turns") && request.method === "GET")
      return json({ retentionDays: TURN_HISTORY_RETENTION_DAYS, turns: this.listTurns() });
    if (url.pathname.endsWith("/images/generate") && request.method === "POST")
      return this.generateCampaignImage(request);
    if (url.pathname.endsWith("/images") && request.method === "GET")
      return json({ images: await this.listImageDrafts(url.searchParams.get("campaignId")) });
    const rejectMatch = url.pathname.match(/\/images\/([a-f0-9-]{36})\/reject$/);
    if (rejectMatch && request.method === "POST") return this.rejectImageDraft(rejectMatch[1]);
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
    if (url.pathname.endsWith("/working-set/reset") && request.method === "POST") {
      this.resetWorkingSet();
      return json(this.state.workingSet);
    }
    if (url.pathname.endsWith("/confirmations") && request.method === "POST") {
      const body = (await request.json()) as {
        action?: unknown;
        recordId?: unknown;
        summary?: unknown;
        imageId?: unknown;
      };
      const action = body.action;
      const recordId = body.recordId;
      if (
        (action !== "save-draft-campaign" &&
          action !== "create-review-task" &&
          action !== "attach-generated-image") ||
        typeof recordId !== "string" ||
        !/^[a-zA-Z0-9]{15,18}$/.test(recordId)
      )
        return json(
          { error: { code: "VALIDATION_FAILED", message: "The confirmation request is invalid." } },
          { status: 400 },
        );
      const preflightBlocked = this.writeBlocked(action);
      if (preflightBlocked) return preflightBlocked;
      // Writes act on the campaign this chat has open, never on a record it hasn't seen.
      if (openCampaign(this.state.workingSet)?.recordId !== recordId)
        return json(
          {
            error: {
              code: "CONFIRMATION_REQUIRED",
              message: "Open this campaign in the chat first, then confirm the action.",
            },
          },
          { status: 409 },
        );
      let summary = typeof body.summary === "string" ? body.summary.trim() : "";
      let image: { imageId: string; contentHash: string } | undefined;
      if (action === "attach-generated-image") {
        const draft =
          typeof body.imageId === "string" ? await this.findImageDraft(body.imageId) : null;
        if (!draft || draft.campaign_id !== recordId || draft.lifecycle !== "draft")
          return json(
            {
              error: {
                code: "VALIDATION_FAILED",
                message: "Choose an unexpired draft image generated for this campaign.",
              },
            },
            { status: 400 },
          );
        image = { imageId: draft.image_id, contentHash: draft.content_hash };
        // The summary is server-authored so the confirmation card states exactly what is attached.
        summary =
          `Attach the selected ${draft.channel} image draft to the campaign as a Salesforce file. Concept: ${draft.prompt_summary}`.slice(
            0,
            500,
          );
      }
      // Brief saves and review requests act on the focus draft when there is one; the server
      // writes the summary from the focus so the card states exactly what will be written.
      const focus = this.state.workingSet.focus;
      let focusRef: Confirmation["focus"];
      if (focus && (action === "save-draft-campaign" || action === "create-review-task")) {
        const current = currentFocusVersion(focus);
        focusRef = { id: focus.id, version: current.version, title: current.title };
        summary =
          action === "save-draft-campaign"
            ? focusBriefText(focus)
            : `Review "${current.title}" (version ${current.version}) with current campaign context, readiness findings, a due date, and a human review checklist.`.slice(
                0,
                500,
              );
      }
      if (!summary)
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
          summary,
          principal: this.principalSubject,
          ...(image ?? {}),
          ...(focusRef ? { focus: focusRef } : {}),
        }),
      );
      const confirmation = ConfirmationSchema.parse({
        id,
        action,
        recordId,
        principalSubject: this.principalSubject,
        requestHash,
        idempotencyKey,
        summary,
        expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
        status: "pending",
        ...(image ?? {}),
        ...(focusRef ? { focus: focusRef } : {}),
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
      const executeBlocked = this.writeBlocked(current.action);
      if (executeBlocked) return executeBlocked;
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
            : current.action === "attach-generated-image"
              ? "attach_campaign_image"
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
        const imagePayload =
          current.action === "attach-generated-image"
            ? await this.loadConfirmedImage(current)
            : undefined;
        if (imagePayload && "error" in imagePayload)
          return json(
            { error: { code: "CONFLICT", message: imagePayload.error } },
            { status: 409 },
          );
        let upstream: unknown;
        try {
          upstream = await resolveToolResult(
            tool.execute(
              {
                inputs: [
                  {
                    campaignId: current.recordId,
                    ...(current.action === "save-draft-campaign" ? { brief: current.summary } : {}),
                    ...(imagePayload ?? {}),
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
          current.action === "create-review-task"
            ? findToolField(upstream, "taskId")
            : current.action === "attach-generated-image"
              ? findToolField(upstream, "contentDocumentId")
              : campaignId;
        const imageDetails =
          current.action === "attach-generated-image"
            ? {
                contentVersionId: findToolField(upstream, "contentVersionId"),
                title: findToolField(upstream, "title"),
                contentSize: findToolField(upstream, "contentSize"),
                contentHash: findToolField(upstream, "contentHash"),
              }
            : {};
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
              typeof taskDetails.description !== "string")) ||
          (current.action === "attach-generated-image" &&
            (typeof imageDetails.contentVersionId !== "string" ||
              typeof imageDetails.title !== "string" ||
              typeof imageDetails.contentSize !== "number" ||
              imageDetails.contentHash !== current.contentHash))
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
        if (current.imageId) await this.markImageAttached(current.imageId);
        this.setState({
          ...this.state,
          pendingConfirmation: null,
          workingSet: this.withCreatedRecord(
            current.action,
            sourceRecordId,
            typeof taskDetails.subject === "string"
              ? taskDetails.subject
              : typeof imageDetails.title === "string"
                ? imageDetails.title
                : undefined,
          ),
          activity: [
            {
              id: `${current.action}-${sourceRecordId}`,
              label: ACTIVITY_LABELS[current.action],
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
            ...imageDetails,
            idempotencyKey: current.idempotencyKey,
            readBack: true,
          },
        });
      }
      const executed = { ...current, status: "executed" as const };
      // The local fixture still verifies the confirmed image bytes so the flow is exercised end to end.
      const fixtureImage =
        current.action === "attach-generated-image"
          ? await this.loadConfirmedImage(current)
          : undefined;
      if (fixtureImage && "error" in fixtureImage)
        return json({ error: { code: "CONFLICT", message: fixtureImage.error } }, { status: 409 });
      const fixtureRecordId =
        current.action === "create-review-task"
          ? "00T000000000001"
          : current.action === "attach-generated-image"
            ? "069000000000001"
            : current.recordId;
      await this.recordConfirmationAudit(current, "executed", fixtureRecordId);
      if (current.imageId) await this.markImageAttached(current.imageId);
      this.setState({
        ...this.state,
        pendingConfirmation: null,
        workingSet: this.withCreatedRecord(
          current.action,
          fixtureRecordId,
          current.action === "create-review-task"
            ? "Review campaign readiness: VERO Phase 1 Launch"
            : fixtureImage?.title,
        ),
        activity: [
          {
            id: `${current.action}-${current.id}`,
            label: ACTIVITY_LABELS[current.action],
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
          ...(fixtureImage
            ? {
                contentVersionId: "068000000000001",
                title: fixtureImage.title,
                contentSize: Math.floor((fixtureImage.imageBase64.length * 3) / 4),
                contentHash: fixtureImage.contentHash,
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
    const abortSignal = options?.abortSignal;
    // Writes and forbidden actions never reach the model, so it cannot claim they happened.
    const utterance = latestUserText(evidenceTurnMessages(this.messages));
    const policyIntent = classifyPolicyIntent(utterance);
    if (policyIntent)
      return scriptedResponse(
        [policyResponse(policyIntent, this.focusReferent() ?? this.previousReplyReferent())],
        {
          model: POLICY_ROUTER,
          route: policyIntent,
          abortSignal,
          onComplete: (result) =>
            this.recordTurn(utterance, { model: POLICY_ROUTER, route: policyIntent }, result),
        },
      );
    // The first message of a conversation starts a fresh working set, whatever cleared the chat.
    if (!this.messages.some((message) => message.role === "assistant")) this.resetWorkingSet();
    if ((this.env.ENVIRONMENT as string) !== "local")
      return this.productionChatResponse(this.messages, abortSignal);
    // Local development has no Salesforce: fixture results go through the same ingestion path
    // as real tool results, so the workspace behaves the same way.
    for (const [toolName, result] of LOCAL_FIXTURE_RESULTS)
      this.ingestToolResult(toolName, { message: "Review the sample campaign" }, result);
    const localDraft = localFixtureDraft(utterance, this.state.workingSet.focus);
    if (localDraft) {
      const focus = this.updateFocus(localDraft);
      const current = currentFocusVersion(focus);
      return scriptedResponse(
        [
          `**${current.title}** (version ${current.version}) is in your workspace.\n\n`,
          ...current.fields.map((field) => `- **${field.label}:** ${field.value}\n`),
          "\nIt is a draft: nothing was saved to Salesforce, scheduled, or sent.",
        ],
        {
          model: "local-fixture",
          reasoning:
            "Local development has no model: save the fictional fixture draft as the workspace focus.",
          abortSignal,
          onComplete: (result) =>
            this.recordTurn(utterance, { model: "local-fixture", route: "local-fixture" }, result),
        },
      );
    }
    return scriptedResponse(
      [
        "I reviewed the fictional Northstar sample campaign. The **strongest signal is stable engagement**.\n\n",
        "**Readiness blockers**\n\n- Accessibility copy\n- Commercial-consent scope\n\n",
        "I have not changed, published, or sent anything.",
      ],
      {
        model: "local-fixture",
        reasoning:
          "Local development has no Salesforce connection: answer from the fictional local fixture, whose results also fill the workspace.",
        abortSignal,
        onComplete: (result) =>
          this.recordTurn(utterance, { model: "local-fixture", route: "local-fixture" }, result),
      },
    );
  }
}
