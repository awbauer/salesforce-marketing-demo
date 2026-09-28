// Only first-person claims, or a record said to be in a written state, count as claims. Campaign
// facts such as "it has been sent to 12,400 recipients" describe Salesforce data, not an action.
const WRITE_CLAIM =
  /\bI(?: have|'ve)?\s+(?:just\s+)?(?:successfully\s+)?(?:saved|published|sent|activated|scheduled|attached|deleted|updated)\b|\b(?:campaign|brief|email|image|task|draft|record|file)\s+(?:has been|was|is now)\s+(?:successfully\s+)?(?:saved|published|activated|scheduled|attached|deleted|created)\b|\bI(?: have|'ve)?\s+created (?:a|the) (?:review )?task\b/i;

// "Nothing has been saved" and "I did not publish it" are accurate disclaimers.
const NEGATED =
  /\b(?:nothing|no \w+)\s+(?:has|have) been\b[^.]*|\b(?:has|have|was|were)(?: not|n't) been\b[^.]*|\b(?:didn't|did not|haven't|have not|won't|will not|can't|cannot|never)\b[^.]*/gi;

export function claimsWrite(text: string) {
  return WRITE_CLAIM.test(text.replace(NEGATED, " "));
}

// Fictional graph entities specific enough to count as a claim when an answer names them.
// Channels, dayparts, and weather are left out: "email" or "dinner" is not a graph citation.
// Approval IDs are the sharpest check in a regulated industry: an invented one is a compliance failure.
const GROUNDED_LABELS = new Set([
  "Account",
  "Client",
  "Approval",
  "Persona",
  "Campaign",
  "Segment",
  "MenuItem",
  "ContentAsset",
  "Brief",
]);

/** The graph entity names worth checking for grounding, from a dataset's nodes. */
export function groundingEntities(nodes: ReadonlyArray<{ label: string; name: string }>) {
  return [
    ...new Set(
      nodes
        .filter((node) => GROUNDED_LABELS.has(node.label) && node.name.trim().length > 3)
        .map((node) => node.name.trim()),
    ),
  ];
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Graph entities the answer names that no tool returned: a graph answer must cite only what
 * its evidence paths contain. Matching is case-insensitive on whole words.
 */
export function ungroundedEntities(
  answer: string,
  evidence: string,
  entities: readonly string[],
): string[] {
  const named = (text: string, entity: string) =>
    new RegExp(`(?<![\\w])${escapeRegExp(entity)}(?![\\w])`, "i").test(text);
  return entities.filter((entity) => named(answer, entity) && !named(evidence, entity));
}
