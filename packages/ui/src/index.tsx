import type { InsightTile } from "@northstar/contracts";

const SALESFORCE_SANDBOX_ORIGIN = "https://pu1788182184076.my.salesforce.com";

export function salesforceRecordUrl(objectApiName: string, recordId: string) {
  const objectName = encodeURIComponent(objectApiName);
  const id = encodeURIComponent(recordId);
  return `${SALESFORCE_SANDBOX_ORIGIN}/lightning/r/${objectName}/${id}/view`;
}

export function normalizeAssistantText(text: string) {
  let normalized = text.trim();
  if (normalized.startsWith("{") && normalized.endsWith("}")) {
    try {
      const parsed = JSON.parse(normalized) as unknown;
      if (parsed && typeof parsed === "object") {
        const record = parsed as Record<string, unknown>;
        const candidate = record.message ?? record.text ?? record.response;
        if (typeof candidate === "string") normalized = candidate;
      }
    } catch {
      // Fall through to the partial-envelope recovery below.
    }
  }
  const partial = normalized.match(/^\{\s*"(?:message|text|response)"\s*:\s*"([\s\S]*)$/);
  if (partial) {
    let fragment = (partial[1] ?? "").replace(/"\s*\}\s*$/, "");
    try {
      fragment = JSON.parse(`"${fragment.replace(/"$/, "")}"`) as string;
    } catch {
      fragment = fragment
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\n")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
    }
    normalized = fragment;
  }
  return normalized
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\|{2,}/g, "\n")
    .replace(/\s*\|\s*/g, " · ")
    .replace(/(?:\s*·?\s*-{3,}){2,}\s*·?\s*/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function shouldShowChatError(
  hasError: boolean,
  messages: readonly {
    role: string;
    text: string;
    hasCompletedToolOutput?: boolean;
  }[] = [],
) {
  if (!hasError) return false;
  const latestUserIndex = messages.map((message) => message.role).lastIndexOf("user");
  return !messages
    .slice(latestUserIndex + 1)
    .some(
      (message) =>
        message.role === "assistant" &&
        (message.hasCompletedToolOutput || normalizeAssistantText(message.text).length > 0),
    );
}

export function toolFreeTraceDetail(text: string) {
  return /tool catalog is not ready|salesforce.*unavailable/i.test(normalizeAssistantText(text))
    ? "No Salesforce tool completed; the response shows the connection recovery step"
    : "Completed without an external tool because no Salesforce action was needed";
}

const labels = {
  loading: "Loading",
  empty: "No insight",
  error: "Unavailable",
  stale: "Needs refresh",
  "permission-denied": "Access required",
  ready: "Current",
} as const;

export function resolveTileRenderMode(
  tile: InsightTile,
  availableResources: readonly string[] = [],
) {
  if (
    tile.presentation?.kind === "hxl" &&
    tile.presentation.sourceStatus === "deployed" &&
    availableResources.includes(tile.presentation.resourceUri)
  )
    return "hxl" as const;
  return "native" as const;
}

export function InsightCard({
  tile,
  availableResources = [],
}: {
  tile: InsightTile;
  availableResources?: readonly string[];
}) {
  const renderMode = resolveTileRenderMode(tile, availableResources);
  return (
    <article
      className={`insight-card state-${tile.state}`}
      data-hxl-resource={tile.presentation?.resourceUri}
      data-render-mode={renderMode}
      data-testid={`tile-${tile.kind}`}
    >
      <div className="card-topline">
        <span>{tile.eyebrow}</span>
        <span>
          {tile.presentation && (
            <span className="render-mode">{renderMode === "hxl" ? "HXL" : "Native fallback"}</span>
          )}
          <span className="state-chip">{labels[tile.state]}</span>
        </span>
      </div>
      <h3>{tile.title}</h3>
      {tile.metric && (
        <div className="metric">
          <strong>{tile.metric}</strong>
          <span>{tile.trend}</span>
        </div>
      )}
      <p>{tile.summary}</p>
      <ul>
        {tile.details.map((detail) => (
          <li key={detail}>{detail}</li>
        ))}
      </ul>
      <footer>
        <span>{tile.source.label}</span>
        <time>{tile.source.freshness}</time>
        {tile.recordRef && (
          <a
            href={salesforceRecordUrl(tile.recordRef.objectApiName, tile.recordRef.recordId)}
            target="_blank"
            rel="noreferrer"
          >
            Open in Salesforce <span aria-hidden="true">↗</span>
          </a>
        )}
      </footer>
    </article>
  );
}

export function InsightBoard({
  tiles,
  availableResources = [],
}: {
  tiles: InsightTile[];
  availableResources?: readonly string[];
}) {
  if (tiles.length === 0)
    return (
      <div className="empty-state">
        <strong>No insights yet</strong>
        <span>Ask the orchestrator to review a sample campaign.</span>
      </div>
    );
  return (
    <div className="insight-grid">
      {tiles.map((tile) => (
        <InsightCard key={tile.id} tile={tile} availableResources={availableResources} />
      ))}
    </div>
  );
}
