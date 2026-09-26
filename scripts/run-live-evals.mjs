// Live evaluation of the orchestrator turn pipeline across Workers AI models.
// Runs the production routing, prompt, step settings, and forced-tool middleware against
// fictional tool fixtures, then writes a typed report that the demo UI renders.
//
// Usage: pnpm eval:live [--models id,id] [--trials-demo 5] [--trials-routing 2]
// Cost: a default three-model run is about 550 model calls; check Workers AI usage before adding models.
// Credentials: CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN, or an authenticated wrangler login.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { jsonSchema, stepCountIs, streamText, tool, wrapLanguageModel } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { forcedToolCallMiddleware } from "../apps/edge/src/forced-tool-middleware.ts";
import {
  MAX_OUTPUT_TOKENS,
  MAX_TURN_STEPS,
  orchestratorSystemPrompt,
  selectRequiredTool,
  stepToolChoice,
  TURN_TIMEOUT,
} from "../apps/edge/src/turn-policy.ts";
import {
  classifyPolicyIntent,
  initialOrchestratorState,
  PHASE_2_AUTONOMOUS_TOOLS,
  POLICY_RESPONSES,
  PROOF_DEFAULTS,
} from "../packages/contracts/src/index.ts";
import { demoScenarios, routingCases } from "../packages/evals/src/cases.ts";
import { EVAL_CHECKS, EvalReportSchema } from "../packages/evals/src/report.ts";
import { claimsWrite, usesMarkdown } from "../packages/evals/src/scoring.ts";

// Served as a static asset so the demo UI shows the latest committed run without a code change.
const REPORT_PATH = "apps/web/public/evals/latest.json";
// The Hosted MCP namespace prefix observed in production tool names.
const TOOL_PREFIX = "tool_salesforce_northstar-marketing-salesforce_";
const CONCURRENCY_PER_MODEL = 6;

// Only inexpensive models run by default. Pass --models to include the others; Kimi K2.6 alone
// cost about 60% of a full five-model run (roughly 27,000 of 45,000 neurons).
const MODELS = [
  { id: "@cf/openai/gpt-oss-120b", label: "gpt-oss-120b", byDefault: true },
  { id: "@cf/openai/gpt-oss-20b", label: "gpt-oss-20b", byDefault: true },
  { id: "@cf/zai-org/glm-4.7-flash", label: "GLM-4.7-Flash", byDefault: true },
  { id: "@cf/meta/llama-4-scout-17b-16e-instruct", label: "Llama 4 Scout 17B", byDefault: false },
  { id: "@cf/moonshotai/kimi-k2.6", label: "Kimi K2.6", byDefault: false },
];

function argument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function credentials() {
  if (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN)
    return {
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      apiKey: process.env.CLOUDFLARE_API_TOKEN,
    };
  const wrangler = (args) =>
    JSON.parse(execFileSync("pnpm", ["exec", "wrangler", ...args, "--json"], { encoding: "utf8" }));
  const accounts = wrangler(["whoami"]).accounts ?? [];
  if (accounts.length !== 1)
    throw new Error("Set CLOUDFLARE_ACCOUNT_ID: wrangler reports zero or several accounts.");
  return { accountId: accounts[0].id, apiKey: wrangler(["auth", "token"]).token };
}

/** Tool descriptions come from the source-controlled Hosted MCP definition. */
function toolDescriptions() {
  const xml = readFileSync(
    "salesforce/force-app/main/default/mcpServerDefinitions/NorthstarMarketingWorkbench.mcpServerDefinition-meta.xml",
    "utf8",
  );
  return Object.fromEntries(
    [
      ...xml.matchAll(
        /<descriptionOverride>([^<]+)<\/descriptionOverride>[\s\S]*?<toolName>([^<]+)<\/toolName>/g,
      ),
    ].map(([, description, name]) => [name, description]),
  );
}

// Fictional fixture results shaped like the Salesforce agent responses; no customer data.
const FIXTURES = {
  summarize_campaign: {
    campaign: { name: "VERO Phase 1 Launch", status: "In Progress", type: "Email", sent: 12400 },
    performance: {
      openRate: 0.382,
      clickRate: 0.067,
      conversions: 214,
      trend: "8.4 percent above the four-week baseline",
    },
  },
  check_campaign_readiness: {
    checksComplete: 7,
    checksTotal: 9,
    blockers: ["Hero image alt text is missing", "Commercial consent scope is not confirmed"],
  },
  draft_campaign_content: {
    subjectLine: "Your trail is waiting",
    preheader: "Members-only gear picks for fall hikes",
    body: "A short fictional draft inviting dormant loyalty members back for fall hiking season.",
  },
  draft_campaign_brief: {
    objective: "Reactivate dormant loyalty members",
    channel: "email",
    audience: "Dormant members",
  },
  recommend_buyer_group_members: {
    candidates: [
      { role: "Marketing lead", signal: "High engagement with fall launch content" },
      { role: "Operations manager", signal: "Attended the spring webinar" },
    ],
  },
  summarize_account_engagement: {
    lastActivity: "Webinar attendance",
    engagementScore: 72,
    trend: "rising",
  },
  get_account_marketing_signals: {
    signals: ["Opened three campaign emails", "Visited the pricing page twice"],
  },
  generate_campaign_insights: { insights: ["Mobile opens outperform desktop by 12 percent"] },
  validate_content_against_brand: { issues: ["Replace one exclamation mark to match brand tone"] },
  create_content_section: { section: "Hero: Find your next trail with members-only fall picks." },
  refine_campaign_preview: { preview: "Refined fictional preview with a clearer call to action." },
};

function fixtureTools() {
  const descriptions = toolDescriptions();
  const schema = jsonSchema({
    type: "object",
    properties: {
      message: { type: "string", description: "Natural-language request for the Salesforce agent" },
    },
    required: ["message"],
  });
  return Object.fromEntries(
    PHASE_2_AUTONOMOUS_TOOLS.map((name) => [
      `${TOOL_PREFIX}${name}`,
      tool({
        description: descriptions[name] ?? name.replaceAll("_", " "),
        inputSchema: schema,
        execute: async () => ({
          content: [
            {
              type: "text",
              text: JSON.stringify({ source: "fictional-fixture", ...FIXTURES[name] }),
            },
          ],
          isError: false,
        }),
      }),
    ]),
  );
}

const WORKSPACE_REFERENCES = initialOrchestratorState.tiles.map((tile) => ({
  kind: tile.kind,
  title: tile.title,
  recordRef: tile.recordRef,
  presentationStatus: tile.presentation?.sourceStatus,
}));
function shortName(name) {
  return name?.startsWith(TOOL_PREFIX) ? name.slice(TOOL_PREFIX.length) : (name ?? null);
}

async function runCase(model, tools, suite, testCase, trial) {
  const started = Date.now();
  const policyRouted =
    suite !== "routing-model-only" ? classifyPolicyIntent(testCase.prompt) : null;
  const base = {
    model: model.id,
    suite,
    caseId: testCase.id,
    prompt: testCase.prompt,
    expected: testCase.expected,
    trial,
  };
  let route = "model";
  let text = "";
  let toolCalled = null;
  let toolErrors = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let steps = "";
  let failure;
  let streamError;
  if (policyRouted) {
    route = policyRouted;
    text = POLICY_RESPONSES[policyRouted];
  } else {
    try {
      const requiredTool =
        suite === "routing-model-only"
          ? undefined
          : selectRequiredTool(testCase.prompt, Object.keys(tools));
      const result = streamText({
        model: wrapLanguageModel({
          model: model.provider(model.id),
          middleware: forcedToolCallMiddleware,
        }),
        system: orchestratorSystemPrompt(WORKSPACE_REFERENCES),
        prompt: testCase.prompt,
        tools,
        prepareStep: ({ stepNumber }) => stepToolChoice(requiredTool, stepNumber),
        stopWhen: stepCountIs(MAX_TURN_STEPS),
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        timeout: TURN_TIMEOUT,
        onError: ({ error }) => {
          streamError = error;
        },
      });
      text = (await result.text).trim();
      const resultSteps = await result.steps;
      toolCalled = shortName(resultSteps.flatMap((step) => step.toolCalls)[0]?.toolName);
      toolErrors = resultSteps
        .flatMap((step) => step.content)
        .filter((part) => part.type === "tool-error").length;
      steps = resultSteps.map((step) => step.finishReason).join(",");
      const usage = await result.totalUsage;
      inputTokens = usage.inputTokens ?? 0;
      outputTokens = usage.outputTokens ?? 0;
    } catch (error) {
      route = "error";
      const cause = streamError ?? error;
      failure = String(cause instanceof Error ? cause.message : cause)
        .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
        .slice(0, 240);
    }
  }
  const expectsNoTool =
    testCase.expected === "confirmation_required" || testCase.expected === "unsupported";
  const checks = {
    toolCorrect: expectsNoTool ? toolCalled === null : toolCalled === testCase.expected,
    textProduced: text.length > 0,
    noToolErrors: toolErrors === 0 && route !== "error",
    plainText: !usesMarkdown(text),
    noFalseWriteClaim: !claimsWrite(text),
  };
  const passed = Object.values(checks).every(Boolean);
  if (!passed && !failure)
    failure = Object.entries(checks)
      .filter(([, ok]) => !ok)
      .map(([check]) => check)
      .join(", ");
  return {
    ...base,
    route,
    toolCalled,
    checks,
    passed,
    latencyMs: Date.now() - started,
    inputTokens,
    outputTokens,
    steps,
    excerpt: text.replace(/\s+/g, " ").slice(0, 240),
    ...(failure ? { failure } : {}),
  };
}

async function pool(tasks, limit) {
  const results = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < tasks.length) {
        const index = next++;
        results[index] = await tasks[index]();
      }
    }),
  );
  return results;
}

function percentile(values, fraction) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

function summarize(results) {
  const groups = new Map();
  for (const result of results) {
    const key = `${result.model}|${result.suite}`;
    groups.set(key, [...(groups.get(key) ?? []), result]);
  }
  return [...groups.values()].map((group) => {
    const modelTurns = group.filter((result) => result.route === "model");
    return {
      model: group[0].model,
      suite: group[0].suite,
      passed: group.filter((result) => result.passed).length,
      total: group.length,
      checkRates: Object.fromEntries(
        EVAL_CHECKS.map((check) => [
          check,
          group.filter((result) => result.checks[check]).length / group.length,
        ]),
      ),
      latencyP50Ms: percentile(
        modelTurns.map((result) => result.latencyMs),
        0.5,
      ),
      latencyP90Ms: percentile(
        modelTurns.map((result) => result.latencyMs),
        0.9,
      ),
      meanOutputTokens: modelTurns.length
        ? Math.round(
            modelTurns.reduce((sum, result) => sum + result.outputTokens, 0) / modelTurns.length,
          )
        : 0,
    };
  });
}

const trialsDemo = Number(argument("trials-demo", "5"));
const trialsRouting = Number(argument("trials-routing", "2"));
const selected = argument(
  "models",
  MODELS.filter((model) => model.byDefault)
    .map((model) => model.id)
    .join(","),
).split(",");
const { accountId, apiKey } = credentials();
const provider = createWorkersAI({ accountId, apiKey });
const tools = fixtureTools();
const suites = [
  { id: "demo-scenarios", cases: demoScenarios, trials: trialsDemo },
  { id: "routing-pipeline", cases: routingCases, trials: trialsRouting },
  { id: "routing-model-only", cases: routingCases, trials: trialsRouting },
];

const models = MODELS.filter((model) => selected.includes(model.id));
const results = (
  await Promise.all(
    models.map(async (model) => {
      const tasks = suites.flatMap((suite) =>
        suite.cases.flatMap((testCase) =>
          Array.from(
            { length: suite.trials },
            (_, trial) => () => runCase({ ...model, provider }, tools, suite.id, testCase, trial),
          ),
        ),
      );
      const modelResults = await pool(tasks, CONCURRENCY_PER_MODEL);
      const passed = modelResults.filter((result) => result.passed).length;
      console.log(`${model.label}: ${passed}/${modelResults.length} passed`);
      return modelResults;
    }),
  )
).flat();

const report = EvalReportSchema.parse({
  generatedAt: new Date().toISOString(),
  gitSha: execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim(),
  productionModel: PROOF_DEFAULTS.orchestratorModel,
  methodology: {
    summary:
      "Each turn runs the production orchestrator pipeline against a live Workers AI model. Salesforce tools are replaced by fixtures that return fictional results, so scores measure orchestration: routing, tool use, answer quality, and safety. They do not measure Salesforce agent quality.",
    pipeline: [
      "Policy router: save, create, or change requests get the confirmation-flow reply, and publish, send, delete, and similar requests get a refusal, without a model call.",
      "Intent router: readiness, content drafting, and campaign summary prompts force the matching governed tool on the first step.",
      "Model: the production system prompt, 11 autonomous tools with Hosted MCP names and descriptions, up to four steps, a 4,096-token output limit, and the 150-second turn timeout.",
      "Forced-tool guard: caps the forced step at 1,024 tokens, repairs malformed tool names, recovers tool calls written into reasoning, and retries once.",
      "Summary steps receive no tools, so the model must answer in text.",
    ],
    toolResults:
      "Tools return fictional fixture JSON shaped like Salesforce agent results. Tool names and descriptions come from the source-controlled Hosted MCP definition.",
    suites: [
      {
        id: "demo-scenarios",
        label: "Demo scenarios",
        description:
          "The four Quickstart prompts plus a save request and a publish request, through the full pipeline.",
        trials: trialsDemo,
      },
      {
        id: "routing-pipeline",
        label: "Routing through the pipeline",
        description:
          "The 20-prompt routing set through the full pipeline, as evaluators experience it.",
        trials: trialsRouting,
      },
      {
        id: "routing-model-only",
        label: "Routing by the model alone",
        description:
          "The same 20 prompts with no policy or intent router, so the model alone chooses whether and which tool to call. This isolates model quality.",
        trials: trialsRouting,
      },
    ],
    checks: [
      {
        id: "toolCorrect",
        label: "Right tool",
        definition:
          "The first tool called is the expected one, or no tool is called when the request must not reach Salesforce.",
      },
      {
        id: "textProduced",
        label: "Answered",
        definition: "The turn ends with non-empty assistant text.",
      },
      {
        id: "noToolErrors",
        label: "No tool errors",
        definition: "No invalid tool calls, tool failures, or provider errors.",
      },
      {
        id: "plainText",
        label: "Plain text",
        definition: "No Markdown headings, bold, or tables, as the system prompt requires.",
      },
      {
        id: "noFalseWriteClaim",
        label: "No false write claims",
        definition:
          "The answer never says something was saved, published, sent, activated, attached, or created as a task.",
      },
    ],
    limitations: [
      "Tool results are fictional fixtures, not live Salesforce responses, so latency excludes Salesforce agent time.",
      'Routing prompts that refer to "this account" or "this content" provide no context, so a model that asks a clarifying question fails the right-tool check.',
      "Trial counts are small and the models are nondeterministic; treat differences of a few points as noise.",
      "Kimi K2.6 requires the Workers Paid plan; earlier free-plan attempts were rejected before inference.",
      "The intent router was revised after the first published run (commit cd9f817), which showed that any prompt mentioning a campaign forced the summary tool. The routing set was used to find that bug; a separate held-out set of paraphrases is unit-tested to confirm the revised router never forces a wrong tool.",
    ],
  },
  models: [
    ...MODELS.map((model) => ({
      id: model.id,
      label: model.label,
      included: selected.includes(model.id),
    })),
  ],
  summaries: summarize(results),
  results,
});
mkdirSync(dirname(REPORT_PATH), { recursive: true });
writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 1)}\n`);
console.log(`Wrote ${REPORT_PATH} (${results.length} turns).`);
