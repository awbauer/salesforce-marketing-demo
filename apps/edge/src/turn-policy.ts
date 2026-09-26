/**
 * Turn routing and model settings shared by the orchestrator and the live evaluation runner.
 * Keep this module free of Workers runtime imports so the evaluation runs exactly this logic.
 */

export const MAX_TURN_STEPS = 4;
// Salesforce agent calls can take tens of seconds, so the budget covers model steps plus tool time.
export const TURN_TIMEOUT = { totalMs: 150_000, chunkMs: 60_000, toolMs: 120_000 } as const;
// Workers AI defaults to 256 output tokens, which gpt-oss reasoning can exhaust before any text.
export const MAX_OUTPUT_TOKENS = 4096;

export function orchestratorSystemPrompt(
  workspaceReferences: unknown,
  toolPlan?: readonly string[],
) {
  // Scenario guidance is added only when its plan is active, so it cannot steer other requests.
  const restaurantPlan = toolPlan?.some((name) => name.endsWith("get_restaurant_profile"));
  return [
    "You are the Northstar marketing proof orchestrator.",
    "Salesforce tool results are the only authority for Salesforce facts. Protocol success does not mean that a business result exists.",
    "If a tool reports unavailable, empty, no business units, no records, or an error, explain that limitation and do not fill gaps from workspace presentation data.",
    "Never say you reviewed Salesforce unless a Salesforce tool returned usable evidence.",
    "Never claim a write, publish, send, or activation occurred. Keep customer PII out of responses.",
    "Earlier messages in this conversation are context for follow-ups such as 'looks good' or 'create it'. Treat facts in your earlier replies as unverified: call the governed tools again before restating Salesforce facts. Chat cannot create, save, publish, or send anything; when asked to act on something from earlier, say what it refers to and point to the confirmation actions in the workspace.",
    "Format answers in concise Markdown: short paragraphs, bold labels, bullet lists, and small tables when they help. Never use raw HTML.",
    ...(restaurantPlan
      ? [
          "For this restaurant push campaign, read the restaurant profile, then the current weather for its city, then ask the campaign content tool for a draft that uses the menu, favorites, local time of day, and weather. Present the featured items, two or three notification variants, a send time, and why each fits. It is a draft; never say it was scheduled or sent.",
        ]
      : []),
    `Non-authoritative workspace record references: ${JSON.stringify(workspaceReferences)}`,
  ].join(" ");
}

// Ordered intent rules. Each needs a specific signal, so a bare mention of "campaign" never forces
// a tool; when no rule matches, the model chooses. Precision matters more than coverage here,
// because a forced wrong tool cannot be recovered within the turn.
const INTENT_RULES: ReadonlyArray<readonly [string, (prompt: string) => boolean]> = [
  [
    "check_campaign_readiness",
    (p) =>
      /\b(?:readiness|ready for|blockers?|risks?|consent coverage)\b/i.test(p) ||
      (/\b(?:complete|missing|incomplete)\b/i.test(p) && /\b(?:dates?|brief)\b/i.test(p)),
  ],
  ["refine_campaign_preview", (p) => /\brefine\b/i.test(p) && /\bpreview\b/i.test(p)],
  [
    "draft_campaign_brief",
    // "Draft a campaign brief" asks for a brief; "draft email content from this brief" does not.
    (p) => /\b(?:draft|create|write)\s+(?:a|an|the|new)?\s*(?:\w+\s+){0,2}brief\b/i.test(p),
  ],
  ["generate_campaign_insights", (p) => /\binsights?\b/i.test(p)],
  [
    "validate_content_against_brand",
    (p) => /\bbrand\b/i.test(p) && /\b(?:check|validate|review|against)\b/i.test(p),
  ],
  [
    "create_content_section",
    (p) =>
      /\b(?:hero|section|header|footer|module|banner)\b/i.test(p) &&
      /\b(?:draft|create|write)\b/i.test(p),
  ],
  [
    "draft_campaign_content",
    (p) =>
      /\b(?:draft|write|create|generate|prepare)\b/i.test(p) &&
      /\b(?:content|copy|subject line|preheader|email|sms|landing page)\b/i.test(p),
  ],
  ["recommend_buyer_group_members", (p) => /\bbuyer group\b/i.test(p)],
  ["get_account_marketing_signals", (p) => /\bsignals?\b/i.test(p) && /\baccounts?\b/i.test(p)],
  ["summarize_account_engagement", (p) => /\bengagement\b/i.test(p) && /\baccount'?s?\b/i.test(p)],
  [
    "summarize_campaign",
    (p) =>
      /\b(?:summarize|summary|recap|overview|performance|perform)\b/i.test(p) &&
      /\b(?:campaign|701[a-zA-Z0-9]{12,15})\b/i.test(p),
  ],
];

// Multi-tool plans for requests that need context before drafting. Each step forces one tool.
const TOOL_PLANS: ReadonlyArray<readonly [readonly string[], (prompt: string) => boolean]> = [
  [
    ["get_restaurant_profile", "get_current_weather", "draft_campaign_content"],
    (p) => /\bpush\b/i.test(p) && /\b(?:notifications?|campaigns?|messages?|alerts?)\b/i.test(p),
  ],
];

/** The ordered tools a prompt requires, or null to let the model choose. */
export function requestedToolPlan(prompt: string): readonly string[] | null {
  const plan = TOOL_PLANS.find(([, matches]) => matches(prompt))?.[0];
  if (plan) return plan;
  const single = INTENT_RULES.find(([, matches]) => matches(prompt))?.[0];
  return single ? [single] : null;
}

export function requestedToolName(prompt: string) {
  return requestedToolPlan(prompt)?.[0] ?? null;
}

function resolveTool(name: string, availableNames: string[]) {
  return availableNames.find((available) => available === name || available.endsWith(`_${name}`));
}

/** Resolves a prompt's plan to available tool keys; undefined if any step's tool is missing. */
export function selectToolPlan(prompt: string, availableNames: string[]) {
  const plan = requestedToolPlan(prompt);
  if (!plan) return undefined;
  const resolved = plan.map((name) => resolveTool(name, availableNames));
  return resolved.every((name): name is string => Boolean(name)) ? resolved : undefined;
}

/** The first planned tool that is not available, for explaining why a plan cannot run. */
export function missingPlannedTool(prompt: string, availableNames: string[]) {
  return requestedToolPlan(prompt)?.find((name) => !resolveTool(name, availableNames)) ?? null;
}

export function selectRequiredTool(prompt: string, availableNames: string[]) {
  return selectToolPlan(prompt, availableNames)?.[0];
}

export function requiredToolChoice(requiredTool: string | undefined, stepNumber: number) {
  if (!requiredTool) return undefined;
  return stepNumber === 0
    ? { toolChoice: { type: "tool" as const, toolName: requiredTool } }
    : { toolChoice: "none" as const };
}

/**
 * Per-step tool settings. Step N of a plan forces its Nth tool and only sees that tool; steps after
 * the plan, and the last allowed step, receive no tools at all: Workers AI does not enforce
 * `toolChoice: "none"`, so gpt-oss otherwise emits malformed tool calls instead of the answer.
 */
export function stepToolChoice(
  plan: string | readonly string[] | undefined,
  stepNumber: number,
  maxSteps = MAX_TURN_STEPS,
) {
  const steps = plan === undefined ? [] : typeof plan === "string" ? [plan] : plan;
  const forced = steps[stepNumber];
  if (forced && stepNumber < maxSteps - 1)
    return { toolChoice: { type: "tool" as const, toolName: forced }, activeTools: [forced] };
  if (steps.length > 0 || stepNumber >= maxSteps - 1)
    return { toolChoice: "none" as const, activeTools: [] as string[] };
  return undefined;
}
