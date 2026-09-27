import { useCallback, useEffect, useState } from "react";

/** One remembered draft or decision, as the Worker's /agent/memory route returns it. */
type MemoryItem = {
  id: string;
  type: "Draft" | "Decision";
  kind: string;
  title: string;
  summary: string;
  at: string;
  expiresAt: string;
  author: string;
  source: string;
  about: Array<{ id: string; label: string; name: string }>;
  records: Array<{ system: string; objectType: string; recordId: string; title: string }>;
  fields: Array<{ label: string; value: string }>;
  version?: number;
  draft?: { id: string; title: string; version: number };
  supersedes?: { id: string; title: string; version: number };
};

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; enabled: boolean; retentionDays: number; items: MemoryItem[] };

const OBJECT_LABELS: Record<string, string> = {
  Northstar_Brief__c: "Brief",
  Northstar_Message__c: "Message",
  ContentDocument: "File",
};

const daysLeft = (expiresAt: string) =>
  Math.max(0, Math.ceil((Date.parse(expiresAt) - Date.now()) / 86_400_000));

async function errorMessage(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as {
    error?: { message?: string };
  } | null;
  return body?.error?.message ?? fallback;
}

/**
 * History → Memory: what the workspace remembers across chats (drafts you asked to remember and
 * confirmed Salesforce writes), with its provenance, expiry, and a Forget button for each item.
 */
export function MemoryPanel({
  refreshKey,
  focusTitle,
}: {
  refreshKey: number;
  focusTitle?: string;
}) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/agent/memory", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(await errorMessage(response, "Memory is unavailable."));
        const body = (await response.json()) as {
          enabled: boolean;
          retentionDays: number;
          items: MemoryItem[];
        };
        setState({ status: "ready", ...body });
      })
      .catch((error: unknown) =>
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Memory is unavailable.",
        }),
      );
  }, []);

  useEffect(() => {
    if (refreshKey >= 0) load();
  }, [load, refreshKey]);

  const remember = async () => {
    setPending("remember");
    setNotice(null);
    const response = await fetch("/agent/memory/remember", { method: "POST" });
    if (response.ok) {
      const body = (await response.json()) as { created: boolean; title: string; version: number };
      setNotice(
        `${body.created ? "Remembered" : "Already remembered"} “${body.title}” (version ${body.version}).`,
      );
      load();
    } else setNotice(await errorMessage(response, "Could not remember the draft."));
    setPending(null);
  };

  const forget = async (item: MemoryItem) => {
    setPending(item.id);
    setNotice(null);
    const response = await fetch(`/agent/memory/${item.id}`, { method: "DELETE" });
    if (response.ok) {
      setNotice(`Forgot “${item.title}”.`);
      load();
    } else setNotice(await errorMessage(response, "Could not forget that memory."));
    setPending(null);
  };

  return (
    <div className="memory-panel">
      {state.status === "loading" && <p role="status">Loading memory…</p>}
      {state.status === "error" && (
        <div className="error-banner" role="alert">
          {state.message}{" "}
          <button type="button" className="text-button" onClick={load}>
            Retry
          </button>
        </div>
      )}
      {state.status === "ready" && (
        <>
          <div className="evaluation-card-heading">
            <p className="evaluation-meta">
              {state.enabled
                ? `${state.items.length} remembered · kept for ${state.retentionDays} days · shared by this workspace, stored in the knowledge graph · written only when you confirm a Salesforce write or ask to remember a draft`
                : "Long-term memory is turned off by an operator. Nothing is remembered or recalled."}
            </p>
            {state.enabled && (
              <button
                type="button"
                className="secondary-button"
                disabled={!focusTitle || pending !== null}
                title={focusTitle ? undefined : "Draft something in the workspace first"}
                onClick={remember}
              >
                {focusTitle ? `Remember “${focusTitle}”` : "Remember current draft"}
              </button>
            )}
          </div>
          {notice && (
            <p className="memory-notice" role="status">
              {notice}
            </p>
          )}
          {state.enabled && state.items.length === 0 && (
            <div className="evaluation-empty" role="status">
              <strong>Nothing remembered yet.</strong>
              <p>
                Ask the chat to “remember this draft”, or confirm a Salesforce save. Then ask “what
                did we decide about …” in a new chat.
              </p>
            </div>
          )}
          {state.items.length > 0 && (
            <ol className="history-list memory-list">
              {state.items.map((item) => (
                <li className="evaluation-card memory-item" key={item.id}>
                  <div className="memory-item-heading">
                    <span className={`history-badge memory-${item.type.toLowerCase()}`}>
                      {item.type === "Draft" ? `Draft v${item.version ?? 1}` : "Decision"}
                    </span>
                    <strong>{item.title}</strong>
                    <button
                      type="button"
                      className="text-button memory-forget"
                      disabled={pending !== null}
                      onClick={() => forget(item)}
                      aria-label={`Forget ${item.title}`}
                    >
                      Forget
                    </button>
                  </div>
                  {item.summary && <p className="memory-summary">{item.summary}</p>}
                  <p className="evaluation-meta">
                    <time dateTime={item.at}>{new Date(item.at).toLocaleString()}</time> ·{" "}
                    {item.source} · {item.author} · expires in {daysLeft(item.expiresAt)} days
                  </p>
                  {(item.about.length > 0 ||
                    item.records.length > 0 ||
                    item.draft ||
                    item.supersedes) && (
                    <ul className="memory-links" aria-label="Provenance">
                      {item.records.map((record) => (
                        <li className="memory-link" key={record.recordId}>
                          <span className="memory-link-kind">Recorded in</span>{" "}
                          {OBJECT_LABELS[record.objectType] ?? record.objectType} {record.title} (
                          <code>{record.recordId}</code>)
                        </li>
                      ))}
                      {item.draft && (
                        <li className="memory-link">
                          <span className="memory-link-kind">From draft</span> {item.draft.title} v
                          {item.draft.version}
                        </li>
                      )}
                      {item.supersedes && (
                        <li className="memory-link">
                          <span className="memory-link-kind">Replaces</span> {item.supersedes.title}{" "}
                          v{item.supersedes.version}
                        </li>
                      )}
                      {item.about.map((node) => (
                        <li className="memory-link" key={node.id}>
                          <span className="memory-link-kind">About</span> {node.label} {node.name}
                        </li>
                      ))}
                    </ul>
                  )}
                  {item.fields.length > 0 && (
                    <details className="payload-viewer">
                      <summary>Remembered fields</summary>
                      <dl className="memory-fields">
                        {item.fields.map((field) => (
                          <div key={field.label}>
                            <dt>{field.label}</dt>
                            <dd>{field.value}</dd>
                          </div>
                        ))}
                      </dl>
                    </details>
                  )}
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  );
}
