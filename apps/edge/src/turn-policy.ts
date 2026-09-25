/**
 * Turn routing and model settings shared by the orchestrator and the live evaluation runner.
 * Keep this module free of Workers runtime imports so the evaluation runs exactly this logic.
 */

export const MAX_TURN_STEPS = 4;
// Salesforce agent calls can take tens of seconds, so the budget covers model steps plus tool time.
export const TURN_TIMEOUT = { totalMs: 150_000, chunkMs: 60_000, toolMs: 120_000 } as const;
// Workers AI defaults to 256 output tokens, which gpt-oss reasoning can exhaust before any text.
export const MAX_OUTPUT_TOKENS = 4096;

export function orchestratorSystemPrompt(workspaceReferences: unknown) {
  return [
    "You are the Northstar marketing proof orchestrator.",
    "Salesforce tool results are the only authority for Salesforce facts. Protocol success does not mean that a business result exists.",
    "If a tool reports unavailable, empty, no business units, no records, or an error, explain that limitation and do not fill gaps from workspace presentation data.",
    "Never say you reviewed Salesforce unless a Salesforce tool returned usable evidence.",
    "Never claim a write, publish, send, or activation occurred. Keep customer PII out of responses.",
    "Return accessible plain text only. Do not use Markdown, HTML, tables, pipe characters, asterisks, or emoji. Use short paragraphs and hyphen-prefixed bullets when a list helps.",
    `Non-authoritative workspace record references: ${JSON.stringify(workspaceReferences)}`,
  ].join(" ");
}

export function requestedToolName(prompt: string) {
  return /\b(?:readiness|ready|blocker|risk)\b/i.test(prompt)
    ? "check_campaign_readiness"
    : /\b(?:draft|write|create|generate)\b/i.test(prompt) &&
        /\b(?:content|copy|subject line|preheader|email|sms|landing page)\b/i.test(prompt)
      ? "draft_campaign_content"
      : /\b(?:summarize|summary|performance|campaign)\b/i.test(prompt) &&
          /\b(?:salesforce|campaign|701[a-zA-Z0-9]{12,15})\b/i.test(prompt)
        ? "summarize_campaign"
        : null;
}

export function selectRequiredTool(prompt: string, availableNames: string[]) {
  const requested = requestedToolName(prompt);
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

/**
 * Per-step tool settings. A forced step only sees its required tool, and text-only steps receive
 * no tools at all: Workers AI does not enforce `toolChoice: "none"`, so gpt-oss otherwise emits
 * malformed tool calls instead of the summary. The last allowed step is always text-only.
 */
export function stepToolChoice(
  requiredTool: string | undefined,
  stepNumber: number,
  maxSteps = MAX_TURN_STEPS,
) {
  const forced = requiredToolChoice(requiredTool, stepNumber);
  if (forced && forced.toolChoice !== "none")
    return { ...forced, activeTools: [requiredTool as string] };
  if (forced || stepNumber >= maxSteps - 1)
    return { toolChoice: "none" as const, activeTools: [] as string[] };
  return undefined;
}
