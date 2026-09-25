import { useAgentChat } from "@cloudflare/ai-chat/react";
import {
  type Confirmation,
  type GeneratedCampaignImage,
  initialOrchestratorState,
  type OrchestratorState,
  OrchestratorStateSchema,
  PHASE_2_CURATED_TOOLS,
} from "@northstar/contracts";
import {
  InsightBoard,
  normalizeAssistantText,
  salesforceRecordUrl,
  shouldShowChatError,
  toolFreeTraceDetail,
} from "@northstar/ui";
import { useAgent } from "agents/react";
import type { UIMessage } from "ai";
import { useEffect, useRef, useState } from "react";

function messageText(message: UIMessage) {
  const text = message.parts
    .filter(
      (part): part is Extract<UIMessage["parts"][number], { type: "text" }> => part.type === "text",
    )
    .map((part) => part.text)
    .join("");
  return message.role === "assistant" ? normalizeAssistantText(text) : text;
}

type TraceStep = {
  label: string;
  detail: string;
  state: "active" | "complete" | "error";
  payload?: string;
};

const REDACTED_KEYS =
  /token|secret|password|authorization|cookie|signature|confirmation|requesthash|idempotency/i;

function sanitizedPayload(value: unknown): unknown {
  if (typeof value === "string") {
    if (/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i.test(value)) return "[redacted personal data]";
    if (/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/.test(value))
      return "[redacted personal data]";
    return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  }
  if (Array.isArray(value)) return value.slice(0, 20).map(sanitizedPayload);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, child]) => [
        key,
        REDACTED_KEYS.test(key) ? "[redacted]" : sanitizedPayload(child),
      ]),
    );
  return value;
}

function readableToolName(name: string) {
  const known = PHASE_2_CURATED_TOOLS.find((tool) => name === tool || name.endsWith(`_${tool}`));
  return (known ?? name)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function semanticToolFailure(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const status = (value as { semanticStatus?: unknown }).semanticStatus;
  return status === "unavailable" || status === "error";
}

export function executionTrace(message: UIMessage): TraceStep[] {
  if (message.role !== "assistant") return [];
  const toolSteps = message.parts.flatMap((part) => {
    const dynamicName = part.type === "dynamic-tool" ? part.toolName : null;
    const staticName = part.type.startsWith("tool-") ? part.type.slice(5) : null;
    const name = dynamicName ?? staticName;
    if (!name || !("state" in part)) return [];
    const state = String(part.state);
    const failed = state === "output-error" || state === "output-denied";
    const complete = state === "output-available";
    const input = "input" in part ? part.input : undefined;
    const output = "output" in part ? part.output : undefined;
    const unavailable = complete && semanticToolFailure(output);
    return [
      {
        label: `Salesforce agent · ${readableToolName(name)}`,
        detail: failed
          ? "Tool call failed safely"
          : unavailable
            ? "Salesforce returned no usable business result"
            : complete
              ? "Result returned to the orchestrator"
              : "Calling through the governed MCP catalog",
        state: failed || unavailable ? "error" : complete ? "complete" : "active",
        payload: JSON.stringify(
          sanitizedPayload({ input, ...(complete ? { output } : {}) }),
          null,
          2,
        ),
      } satisfies TraceStep,
    ];
  });
  const hasCompletedText = message.parts.some(
    (part) => part.type === "text" && part.state !== "streaming" && part.text.trim(),
  );
  const assistantText = messageText(message);
  return [
    {
      label: "Northstar orchestrator",
      detail: toolSteps.length
        ? "Selected the narrowest governed tools needed for this request"
        : toolFreeTraceDetail(assistantText),
      state: hasCompletedText ? "complete" : "active",
    },
    ...toolSteps,
    ...(hasCompletedText
      ? [
          {
            label: "Evidence assembled",
            detail: "Combined returned evidence into the visible response",
            state: "complete" as const,
          },
        ]
      : []),
  ];
}

export function App() {
  const [state, setState] = useState<OrchestratorState>(initialOrchestratorState);
  const [input, setInput] = useState("");
  const [sessionState, setSessionState] = useState<"loading" | "ready" | "error">("loading");
  const [connectorBusy, setConnectorBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [pendingConfirmation, setPendingConfirmation] = useState<Confirmation | null>(null);
  const [createdRecord, setCreatedRecord] = useState<{
    objectApiName: "Task";
    recordId: string;
    subject: string;
    priority: string;
    dueDate: string;
    status: string;
    campaignId: string;
  } | null>(null);
  const [imageConcept, setImageConcept] = useState(
    "A quiet trailhead at golden hour with layered hiking gear and room for campaign copy",
  );
  const [generatedImage, setGeneratedImage] = useState<GeneratedCampaignImage | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [quickstartOpen, setQuickstartOpen] = useState(false);
  const confirmationRef = useRef<HTMLElement>(null);
  const quickstartCloseRef = useRef<HTMLButtonElement>(null);
  const connectorStatusLoaded = useRef(false);
  const agent = useAgent<OrchestratorState>({
    agent: "MarketingOrchestrator",
    basePath: "agent",
    onStateUpdate(next) {
      const parsed = OrchestratorStateSchema.safeParse(next);
      if (parsed.success) {
        setState((current) => ({
          ...parsed.data,
          connector: connectorStatusLoaded.current ? current.connector : parsed.data.connector,
        }));
        if (parsed.data.pendingConfirmation) {
          setPendingConfirmation(parsed.data.pendingConfirmation);
        }
      }
    },
  });
  const { messages, sendMessage, stop, clearHistory, status, isRecovering, error } = useAgentChat({
    agent,
    resume: true,
    cancelOnClientAbort: false,
  });

  useEffect(() => {
    fetch("/api/session")
      .then((response) => {
        if (!response.ok) throw new Error("session");
        return response.json();
      })
      .then(() => setSessionState("ready"))
      .catch(() => setSessionState("error"));
    loadConnector().catch(() => {
      connectorStatusLoaded.current = true;
      setState((current) => ({
        ...current,
        connector: {
          ...current.connector,
          state: "error",
          message: "Salesforce connection status is unavailable. Retry the page to recover.",
        },
      }));
    });
  }, []);
  const busy = status === "submitted" || status === "streaming" || isRecovering;
  const salesforceReady = state.connector.state === "ready";
  const latestMessage = messages.at(-1);
  const showChatError = shouldShowChatError(
    Boolean(error),
    latestMessage ? { role: latestMessage.role, text: messageText(latestMessage) } : undefined,
  );

  useEffect(() => {
    if (state.connector.state !== "authenticating") return;
    const timer = window.setInterval(() => {
      void loadConnector().catch(() => undefined);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [state.connector.state]);

  useEffect(() => {
    if (pendingConfirmation) confirmationRef.current?.scrollIntoView({ block: "nearest" });
  }, [pendingConfirmation]);

  useEffect(() => {
    if (!quickstartOpen) return;
    quickstartCloseRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setQuickstartOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [quickstartOpen]);

  async function agentAction<T>(path: string, body?: unknown) {
    setActionError("");
    const response = await fetch(`/agent/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    let result: T & { error?: { message?: string } };
    try {
      result = (await response.json()) as T & { error?: { message?: string } };
    } catch {
      throw new Error(
        response.ok
          ? "The server returned an unreadable response. Try again."
          : "The server could not complete the request. Try again or reconnect Salesforce.",
      );
    }
    if (!response.ok)
      throw new Error(result.error?.message ?? "The action could not be completed.");
    return result;
  }

  async function loadConnector() {
    const response = await fetch("/agent/salesforce/status");
    if (!response.ok) throw new Error("Salesforce connection status is unavailable.");
    const connector = OrchestratorStateSchema.shape.connector.parse(await response.json());
    connectorStatusLoaded.current = true;
    setState((current) => ({ ...current, connector }));
    return connector;
  }

  async function connectSalesforce() {
    setConnectorBusy(true);
    try {
      const result = await agentAction<OrchestratorState["connector"]>("salesforce/connect");
      setState((current) => ({ ...current, connector: result }));
      if (result.authUrl) window.location.assign(result.authUrl);
    } catch (actionError) {
      setActionError(actionError instanceof Error ? actionError.message : "Connection failed.");
    } finally {
      setConnectorBusy(false);
    }
  }

  async function disconnectSalesforce() {
    setConnectorBusy(true);
    try {
      const connector = await agentAction<OrchestratorState["connector"]>("salesforce/disconnect");
      setState((current) => ({ ...current, connector }));
    } catch (actionError) {
      setActionError(actionError instanceof Error ? actionError.message : "Disconnect failed.");
    } finally {
      setConnectorBusy(false);
    }
  }

  async function requestReview() {
    const campaign = state.tiles.find((tile) => tile.kind === "readiness")?.recordRef;
    if (!campaign) return;
    try {
      const confirmation = await agentAction<Confirmation>("confirmations", {
        action: "create-review-task",
        recordId: campaign.recordId,
        summary:
          "Create a campaign review task with current campaign context, readiness findings, a due date, and a human review checklist.",
      });
      setPendingConfirmation(confirmation);
      setState((current) => ({ ...current, pendingConfirmation: confirmation }));
    } catch (actionError) {
      setActionError(actionError instanceof Error ? actionError.message : "Preflight failed.");
    }
  }

  async function generateCampaignImage() {
    const campaign = state.tiles.find((tile) => tile.kind === "campaign-brief")?.recordRef;
    if (!campaign) return;
    setImageBusy(true);
    try {
      const image = await agentAction<GeneratedCampaignImage>("images/generate", {
        campaignId: campaign.recordId,
        channel: "email",
        concept: imageConcept,
      });
      setActionError("");
      setGeneratedImage(image);
    } catch (actionError) {
      setActionError(
        actionError instanceof Error ? actionError.message : "Image generation failed.",
      );
    } finally {
      setImageBusy(false);
    }
  }

  async function resolveConfirmation(decision: "execute" | "deny") {
    try {
      const result = await agentAction<{
        result?: {
          recordId: string;
          campaignId: string;
          readBack: boolean;
          status: string;
          subject: string;
          priority: string;
          dueDate: string;
        };
      }>(`confirmations/${decision}`);
      setPendingConfirmation(null);
      setState((current) => ({
        ...current,
        pendingConfirmation: null,
      }));
      if (decision === "execute" && result.result?.readBack) {
        setActionError("");
        setCreatedRecord({
          objectApiName: "Task",
          recordId: result.result.recordId,
          subject: result.result.subject,
          priority: result.result.priority,
          dueDate: result.result.dueDate,
          status: result.result.status,
          campaignId: result.result.campaignId,
        });
      }
    } catch (actionError) {
      setActionError(actionError instanceof Error ? actionError.message : "Confirmation failed.");
    }
  }

  return (
    <main>
      <header className="topbar">
        <div className="brand-mark">N</div>
        <div>
          <p>Northstar</p>
          <h1>Marketing workbench</h1>
        </div>
        <div className="top-actions">
          <span className={`connection ${sessionState}`}>
            {sessionState === "ready"
              ? "Demo workspace"
              : sessionState === "error"
                ? "Connection issue"
                : "Connecting"}
          </span>
          <button type="button" className="avatar" aria-label="User menu">
            AE
          </button>
        </div>
      </header>
      <div className="workspace">
        <nav className="rail" aria-label="Workspace navigation">
          <div>
            <p className="nav-label">Workspace</p>
            <button type="button" className="nav-item active">
              <span>◆</span>Overview
            </button>
            <button type="button" className="nav-item" onClick={() => setQuickstartOpen(true)}>
              <span>?</span>Quickstart
            </button>
          </div>
          <div>
            <p className="nav-label">Sources</p>
            <div className="source-row">
              <i className={`dot ${salesforceReady ? "ready" : "stale"}`} />
              Salesforce CRM
            </div>
            <div className="source-row">
              <i className={`dot ${salesforceReady ? "ready" : "stale"}`} />
              Marketing Cloud Next
            </div>
            <div className="source-row">
              <i className={`dot ${salesforceReady ? "ready" : "stale"}`} />
              Data 360
            </div>
          </div>
          <section className="connector-panel" aria-labelledby="salesforce-connector-title">
            <strong id="salesforce-connector-title">{state.connector.label}</strong>
            <span role={state.connector.state === "error" ? "alert" : undefined}>
              {state.connector.message}
            </span>
            <small className={`connector-state state-${state.connector.state}`}>
              {state.connector.state.replace("-", " ")}
            </small>
            <details className="tool-catalog">
              <summary>
                {state.connector.state === "ready"
                  ? `${state.connector.toolCount} discovered tools`
                  : `${PHASE_2_CURATED_TOOLS.length} configured tools`}
              </summary>
              <p>
                {state.connector.state === "ready"
                  ? "Discovered through the Salesforce MCP portal and filtered by the host allowlist."
                  : "The host allowlist that will be matched against the Salesforce MCP catalog after connection."}
              </p>
              <ul>
                {PHASE_2_CURATED_TOOLS.map((tool) => (
                  <li key={tool}>
                    <code>{tool}</code>
                  </li>
                ))}
              </ul>
            </details>
            {state.connector.state === "authenticating" && state.connector.authUrl && (
              <a href={state.connector.authUrl}>Resume authorization</a>
            )}
            {state.connector.state === "ready" ? (
              <button
                type="button"
                className="secondary-button"
                onClick={() => void disconnectSalesforce()}
                disabled={connectorBusy}
              >
                {connectorBusy ? "Disconnecting…" : "Disconnect"}
              </button>
            ) : state.connector.state !== "not-configured" ? (
              <div className="connector-actions">
                <button
                  type="button"
                  onClick={() => void connectSalesforce()}
                  disabled={connectorBusy}
                >
                  {connectorBusy
                    ? "Connecting…"
                    : state.connector.state === "disconnected"
                      ? "Connect"
                      : "Reconnect"}
                </button>
                {state.connector.state === "authenticating" && (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => void loadConnector()}
                  >
                    Check status
                  </button>
                )}
              </div>
            ) : null}
          </section>
          <div className="rail-footer">
            <span>Guided demo</span>
            <small>Fictional sample data</small>
          </div>
        </nav>
        <section className="conversation" aria-labelledby="chat-title">
          <div className="section-header">
            <div>
              <p className="kicker">Orchestrator</p>
              <h2 id="chat-title">Campaign intelligence</h2>
            </div>
            <div className="chat-actions">
              <button type="button" className="text-button" onClick={() => clearHistory()}>
                New chat
              </button>
              <button
                type="button"
                className="quickstart-button"
                onClick={() => setQuickstartOpen(true)}
              >
                Quickstart
              </button>
              <span className="agent-badge">
                <i />
                Agent online
              </span>
            </div>
          </div>
          <div className="messages" aria-live="polite">
            <article className="message assistant">
              <div className="message-author">Northstar orchestrator</div>
              <p>
                Explore the fictional Northstar campaign with governed Salesforce data. I can
                summarize context, draft content, check readiness, and prepare a review task for
                your confirmation. Nothing is published or sent.
              </p>
            </article>
            {messages.map((message) => (
              <article key={message.id} className={`message ${message.role}`}>
                <div className="message-author">
                  {message.role === "user" ? "You" : "Northstar orchestrator"}
                </div>
                <p>{messageText(message)}</p>
                {message.role === "assistant" && executionTrace(message).length > 0 && (
                  <details className="execution-trace" open>
                    <summary>Behind the scenes · technical trace</summary>
                    <ol>
                      {executionTrace(message).map((step, index) => (
                        <li className={`trace-${step.state}`} key={`${step.label}-${index}`}>
                          <i className={`trace-indicator indicator-${step.state}`} />
                          <div className="trace-detail">
                            <strong>{step.label}</strong>
                            <span className="trace-copy">{step.detail}</span>
                            {step.payload && (
                              <details className="payload-viewer">
                                <summary>Sanitized request / response payload</summary>
                                <pre>{step.payload}</pre>
                              </details>
                            )}
                          </div>
                        </li>
                      ))}
                    </ol>
                    <p className="trace-boundary">
                      Shows execution rationale and sanitized operational data. Credentials,
                      confirmation material, personal data, and private model reasoning are not
                      exposed.
                    </p>
                  </details>
                )}
              </article>
            ))}
            {busy && (
              <section className="live-trace" aria-live="polite">
                <div className="trace-pulse" />
                <div className="live-trace-detail">
                  <strong>Northstar orchestrator is working</strong>
                  <span className="live-trace-copy">
                    Tool selection and Salesforce agent calls will appear in the trace.
                  </span>
                </div>
              </section>
            )}
            {isRecovering && (
              <div className="recovery" role="status">
                Recovering the durable conversation…
              </div>
            )}
            {showChatError && (
              <div className="error-banner" role="alert">
                The turn was interrupted. Your saved conversation is still available; retry when
                ready.
              </div>
            )}
            {actionError && (
              <div className="error-banner" role="alert">
                {actionError}
              </div>
            )}
            {createdRecord && (
              <section className="success-banner" role="status">
                <div>
                  <strong>{createdRecord.subject}</strong>
                  <span>{` · ${createdRecord.priority} priority · due ${createdRecord.dueDate}`}</span>
                </div>
                <a
                  href={salesforceRecordUrl(createdRecord.objectApiName, createdRecord.recordId)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open task in Salesforce <span aria-hidden="true">↗</span>
                </a>
                <details className="write-trace">
                  <summary>Inspect confirmed Salesforce execution</summary>
                  <ol>
                    <li>Orchestrator verified same-user, unexpired confirmation.</li>
                    <li>Salesforce MCP invoked create_campaign_review_request.</li>
                    <li>Apex created one Task with Campaign in the native Related To field.</li>
                    <li>Salesforce returned authoritative Task fields and relationship.</li>
                  </ol>
                  <pre>
                    {JSON.stringify(
                      {
                        request: {
                          action: "create-review-task",
                          campaignId: createdRecord.campaignId,
                          confirmation: "[redacted]",
                          idempotencyKey: "[redacted]",
                        },
                        response: {
                          taskId: createdRecord.recordId,
                          relatedToCampaignId: createdRecord.campaignId,
                          subject: createdRecord.subject,
                          status: createdRecord.status,
                          priority: createdRecord.priority,
                          dueDate: createdRecord.dueDate,
                          readBack: true,
                        },
                      },
                      null,
                      2,
                    )}
                  </pre>
                </details>
              </section>
            )}
            {pendingConfirmation && (
              <section
                ref={confirmationRef}
                className="confirmation-card"
                aria-labelledby="confirmation-title"
              >
                <p className="kicker">Confirmation required</p>
                <h3 id="confirmation-title">Create Salesforce review task?</h3>
                <p>{pendingConfirmation.summary}</p>
                <dl>
                  <div className="confirmation-detail">
                    <dt>Campaign</dt>
                    <dd>
                      <a
                        href={salesforceRecordUrl("Campaign", pendingConfirmation.recordId)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {pendingConfirmation.recordId} <span aria-hidden="true">↗</span>
                      </a>
                    </dd>
                  </div>
                  <div className="confirmation-detail">
                    <dt>Expires</dt>
                    <dd>{new Date(pendingConfirmation.expiresAt).toLocaleTimeString()}</dd>
                  </div>
                </dl>
                <div className="confirmation-actions">
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => void resolveConfirmation("deny")}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="confirm-button"
                    onClick={() => void resolveConfirmation("execute")}
                  >
                    Confirm create
                  </button>
                </div>
              </section>
            )}
          </div>
          <form
            className="composer"
            onSubmit={(event) => {
              event.preventDefault();
              const text = input.trim();
              if (!text || busy) return;
              void sendMessage({ text });
              setInput("");
            }}
          >
            <label htmlFor="prompt" className="sr-only">
              Message the orchestrator
            </label>
            <textarea
              id="prompt"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Try: Check the sample campaign readiness"
              rows={3}
            />
            <div className="composer-footer">
              <span>Fictional data · Confirm before writes · No publish actions</span>
              {busy ? (
                <button type="button" className="send" onClick={() => stop()}>
                  Stop
                </button>
              ) : (
                <button
                  type="submit"
                  className="send"
                  disabled={!input.trim()}
                  aria-label="Send message"
                >
                  ↑
                </button>
              )}
            </div>
          </form>
        </section>
        <aside className="insights" aria-labelledby="insights-title">
          <div className="section-header">
            <div>
              <p className="kicker">Live context</p>
              <h2 id="insights-title">Insights</h2>
            </div>
            <span className="count">{state.tiles.length}</span>
          </div>
          <InsightBoard tiles={state.tiles} />
          <section className="image-workflow" aria-labelledby="image-workflow-title">
            <div>
              <p className="kicker">External creative workflow</p>
              <h3 id="image-workflow-title">Generate campaign visual</h3>
              <p>Workers AI creates a private seven-day draft. Nothing is attached or published.</p>
            </div>
            <label htmlFor="image-concept">Creative concept</label>
            <textarea
              id="image-concept"
              rows={3}
              maxLength={280}
              value={imageConcept}
              onChange={(event) => setImageConcept(event.target.value)}
            />
            <button
              type="button"
              onClick={() => void generateCampaignImage()}
              disabled={imageBusy || imageConcept.trim().length < 8}
            >
              {imageBusy ? "Generating…" : "Generate draft"}
            </button>
            {(imageBusy || generatedImage) && (
              <ol className="image-trace" aria-label="Image generation progress">
                <li className={imageBusy ? "active" : "complete"}>
                  Orchestrator bounded the prompt
                </li>
                <li className={imageBusy ? "active" : "complete"}>
                  Workers AI generated a 1024×1024 PNG
                </li>
                <li className={imageBusy ? "pending" : "complete"}>
                  R2 stored the private draft and D1 provenance
                </li>
              </ol>
            )}
            {generatedImage && (
              <figure className="generated-image-card">
                <img src={generatedImage.imageUrl} alt="Generated Northstar campaign draft" />
                <figcaption>
                  <strong>Reviewable draft</strong>
                  <span className="generated-image-summary">{generatedImage.promptSummary}</span>
                  <small className="generated-image-metadata">
                    {generatedImage.width}×{generatedImage.height} · expires in seven days · not
                    attached to Salesforce
                  </small>
                  <details className="payload-viewer image-payload">
                    <summary>Technical payload and provenance</summary>
                    <pre>
                      {JSON.stringify(
                        {
                          provider: "Cloudflare Workers AI binding",
                          model: generatedImage.model,
                          input: {
                            campaignId: generatedImage.campaignId,
                            channel: generatedImage.channel,
                            concept: generatedImage.promptSummary,
                            width: generatedImage.width,
                            height: generatedImage.height,
                          },
                          output: {
                            imageId: generatedImage.id,
                            contentHash: generatedImage.contentHash,
                            lifecycle: generatedImage.lifecycle,
                            authorizedAssetUrl: generatedImage.imageUrl,
                            expiresAt: generatedImage.expiresAt,
                          },
                          storage: ["R2 private object", "D1 provenance row"],
                        },
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                </figcaption>
              </figure>
            )}
          </section>
          <div className="insight-action">
            <button type="button" onClick={() => void requestReview()}>
              Create review request
            </button>
            <span>Requires confirmation</span>
          </div>
          <section className="activity">
            <h3>Activity</h3>
            {state.activity.map((item) => (
              <div className="activity-row" key={item.id}>
                <i />
                <div>
                  <strong>{item.label}</strong>
                  <span>{item.detail}</span>
                </div>
                <time>{item.occurredAt}</time>
              </div>
            ))}
          </section>
        </aside>
      </div>
      {quickstartOpen && (
        <div className="dialog-backdrop" role="presentation">
          <section
            className="quickstart-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="quickstart-title"
          >
            <div className="quickstart-heading">
              <div>
                <p className="kicker">Guided demo</p>
                <h2 id="quickstart-title">Start with a real workflow</h2>
              </div>
              <button
                ref={quickstartCloseRef}
                type="button"
                className="dialog-close"
                onClick={() => setQuickstartOpen(false)}
                aria-label="Close quickstart"
              >
                ×
              </button>
            </div>
            <p>
              Connect Salesforce, then choose a prompt. Each example uses fictional Northstar data
              and stays inside the demo’s governed tool set.
            </p>
            <ol className="quickstart-steps">
              <li>Confirm the Salesforce connector shows “ready.”</li>
              <li>Choose a prompt below and send it from the composer.</li>
              <li>Review the evidence cards; Salesforce records open in a new tab.</li>
              <li>Expand the technical trace to inspect tool selection and sanitized payloads.</li>
              <li>Approve a write only when the confirmation card matches your intent.</li>
            </ol>
            <h3>Try now</h3>
            <div className="prompt-list">
              {[
                "Summarize the sample campaign and its recent performance",
                "Draft campaign content for the sample audience",
                "Check the sample campaign readiness and explain every blocker",
                "Recommend buyer group members using the available sample signals",
              ].map((prompt) => (
                <button
                  type="button"
                  key={prompt}
                  onClick={() => {
                    setInput(prompt);
                    setQuickstartOpen(false);
                  }}
                >
                  <span>{prompt}</span>
                  <span aria-hidden="true">→</span>
                </button>
              ))}
            </div>
            <p>
              Use <strong>Generate campaign visual</strong> in the Insights panel to create a
              governed Workers AI draft and inspect its storage trace.
            </p>
            <h3>Coming soon / not yet built</h3>
            <ul className="coming-soon">
              <li>Select and attach a generated campaign image to Salesforce.</li>
              <li>Additional HXL cards for standard Salesforce agent results.</li>
              <li>Representative consent-data evaluation in the supplied sandbox.</li>
              <li>Expanded account discovery and buyer-group evidence.</li>
            </ul>
            <p className="boundary-note">
              Publishing, sending, activation, deletion, suppression, and arbitrary Salesforce edits
              are intentionally unavailable in this demo.
            </p>
          </section>
        </div>
      )}
    </main>
  );
}
