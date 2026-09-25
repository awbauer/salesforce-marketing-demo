import { useAgentChat } from "@cloudflare/ai-chat/react";
import {
  type Confirmation,
  initialOrchestratorState,
  type OrchestratorState,
  OrchestratorStateSchema,
} from "@northstar/contracts";
import { InsightBoard, normalizeAssistantText, salesforceRecordUrl } from "@northstar/ui";
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
  } | null>(null);
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
        summary: "Create an open campaign review task for the current readiness blockers.",
      });
      setPendingConfirmation(confirmation);
      setState((current) => ({ ...current, pendingConfirmation: confirmation }));
    } catch (actionError) {
      setActionError(actionError instanceof Error ? actionError.message : "Preflight failed.");
    }
  }

  async function resolveConfirmation(decision: "execute" | "deny") {
    try {
      const result = await agentAction<{
        result?: { recordId: string; campaignId: string; readBack: boolean };
      }>(`confirmations/${decision}`);
      setPendingConfirmation(null);
      setState((current) => ({
        ...current,
        pendingConfirmation: null,
      }));
      if (decision === "execute" && result.result?.readBack) {
        setActionError("");
        setCreatedRecord({ objectApiName: "Task", recordId: result.result.recordId });
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
              </article>
            ))}
            {isRecovering && (
              <div className="recovery" role="status">
                Recovering the durable conversation…
              </div>
            )}
            {error && (
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
              <div className="success-banner" role="status">
                <span>Salesforce review task created and verified.</span>
                <a
                  href={salesforceRecordUrl(createdRecord.objectApiName, createdRecord.recordId)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open task in Salesforce <span aria-hidden="true">↗</span>
                </a>
              </div>
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
            <h3>Coming soon / not yet built</h3>
            <ul className="coming-soon">
              <li>Generate, compare, and attach campaign images.</li>
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
