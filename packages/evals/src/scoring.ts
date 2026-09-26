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
