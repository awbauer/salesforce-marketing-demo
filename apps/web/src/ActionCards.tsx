import type { SuggestedAction } from "@workbench/contracts";

/**
 * Action cards in the chat: things the conversation suggests you approve, such as saving the
 * draft to Salesforce or requesting a review. Accepting one prepares its confirmation card,
 * after Salesforce checks your permissions; nothing is written until you confirm that too.
 */
export function ActionCards({
  suggestions,
  preparing = null,
  onAccept,
  onDismiss,
}: {
  suggestions: readonly SuggestedAction[];
  /** The card whose confirmation is being prepared, if any: every card waits for it. */
  preparing?: string | null;
  onAccept: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  if (!suggestions.length) return null;
  return (
    <ul className="action-cards" aria-label="Suggested actions">
      {suggestions.map((suggestion) => (
        <li key={suggestion.id} className="action-card" data-testid="action-card">
          <p className="kicker">
            {suggestion.action === "save-focus" ? "Save to Salesforce" : "Review"}
          </p>
          <h3>{suggestion.title}</h3>
          <p>{suggestion.detail}</p>
          <div className="action-card-buttons">
            <button
              type="button"
              disabled={preparing !== null}
              aria-busy={preparing === suggestion.id}
              onClick={() => onAccept(suggestion.id)}
            >
              {preparing === suggestion.id ? "Preparing…" : suggestion.cta}
            </button>
            <button
              type="button"
              className="text-button"
              disabled={preparing !== null}
              onClick={() => onDismiss(suggestion.id)}
            >
              Not now
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
