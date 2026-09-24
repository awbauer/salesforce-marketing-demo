import type { InsightTile } from "@northstar/contracts";

export function normalizeAssistantText(text: string) {
  return text
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
