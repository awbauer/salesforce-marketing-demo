// Live evaluation of the orchestrator turn pipeline across Workers AI models.
// Runs the production routing, prompt, step settings, and forced-tool middleware against
// fictional tool fixtures, then writes a typed report that the demo UI renders.
//
// Usage: pnpm eval:live [--models id,id] [--trials-demo 5] [--trials-routing 2] [--out path] [--live-graph]
// Cost: a default three-model run is about 550 model calls; check Workers AI usage before adding models.
// Credentials: CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN, or an authenticated wrangler login.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { jsonSchema, stepCountIs, streamText, tool, wrapLanguageModel } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import {
  CAMPAIGN_CONTEXT_TOOL_PREFIX,
  connectCampaignContextTools,
} from "../apps/edge/src/campaign-context/server.ts";
import { forcedToolCallMiddleware } from "../apps/edge/src/forced-tool-middleware.ts";
import {
  connectKnowledgeGraphTools,
  KNOWLEDGE_GRAPH_TOOL_PREFIX,
  knowledgeGraphBackend,
} from "../apps/edge/src/knowledge-graph/server.ts";
import {
  MAX_OUTPUT_TOKENS,
  MAX_TURN_STEPS,
  orchestratorSystemPrompt,
  selectToolPlan,
  stepToolChoice,
  TURN_TIMEOUT,
} from "../apps/edge/src/turn-policy.ts";
import { workingSetPrompt } from "../apps/edge/src/working-set.ts";
import {
  classifyPolicyIntent,
  emptyWorkingSet,
  PHASE_2_AUTONOMOUS_TOOLS,
  POLICY_RESPONSES,
  PROOF_DEFAULTS,
} from "../packages/contracts/src/index.ts";
import { demoScenarios, routingCases } from "../packages/evals/src/cases.ts";
import { EvalReportSchema } from "../packages/evals/src/report.ts";
import { claimsWrite } from "../packages/evals/src/scoring.ts";
import { buildMethodology } from "./lib/eval-methodology.mjs";
import { summarize } from "./lib/eval-summary.mjs";

// Served as a static asset so the demo UI shows the latest committed run without a code change.
const DEFAULT_REPORT_PATH = "apps/web/public/evals/latest.json";
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
  // Call the local binary directly: pnpm can print a banner before the JSON.
  const wrangler = (args) => {
    const output = execFileSync("node_modules/.bin/wrangler", [...args, "--json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return JSON.parse(output.slice(output.indexOf("{")));
  };
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

// Each evaluation turn is a fresh chat, so its working set is empty and only the catalog is listed.
const WORKSPACE = workingSetPrompt(emptyWorkingSet());
function shortName(name) {
  if (!name) return null;
  if (name.startsWith(TOOL_PREFIX)) return name.slice(TOOL_PREFIX.length);
  if (name.startsWith(CAMPAIGN_CONTEXT_TOOL_PREFIX))
    return name.slice(CAMPAIGN_CONTEXT_TOOL_PREFIX.length);
  if (name.startsWith(KNOWLEDGE_GRAPH_TOOL_PREFIX))
    return name.slice(KNOWLEDGE_GRAPH_TOOL_PREFIX.length);
  return name;
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
      const toolPlan =
        suite === "routing-model-only"
          ? undefined
          : selectToolPlan(testCase.prompt, Object.keys(tools));
      const result = streamText({
        model: wrapLanguageModel({
          model: model.provider(model.id),
          middleware: forcedToolCallMiddleware,
        }),
        system: orchestratorSystemPrompt(WORKSPACE, toolPlan),
        prompt: testCase.prompt,
        tools,
        prepareStep: ({ stepNumber }) => stepToolChoice(toolPlan, stepNumber),
        stopWhen: stepCountIs(MAX_TURN_STEPS),
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        timeout: TURN_TIMEOUT,
        onError: ({ error }) => {
          streamError = error;
        },
      });
      text = (await result.text).trim();
      const resultSteps = await result.steps;
      const called = resultSteps
        .flatMap((step) => step.toolCalls)
        .map((call) => shortName(call.toolName));
      toolCalled = called.length ? called.join(" → ") : null;
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
    // Single-tool cases check the first call; planned sequences must start with every planned tool.
    toolCorrect: expectsNoTool
      ? toolCalled === null
      : (toolCalled ?? "").startsWith(testCase.expected) &&
        (testCase.expected.includes(" → ") || toolCalled?.split(" → ")[0] === testCase.expected),
    textProduced: text.length > 0,
    noToolErrors: toolErrors === 0 && route !== "error",
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

const REPORT_PATH = argument("out", DEFAULT_REPORT_PATH);
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
// Salesforce tools are fixtures; the campaign-context MCP runs for real (mocked restaurant data,
// live Open-Meteo weather) through the same in-process MCP client as production.
const campaignContext = await connectCampaignContextTools();
// The knowledge graph uses its local fictional copy unless --live-graph points it at Neo4j.
const graph = await connectKnowledgeGraphTools(
  process.argv.includes("--live-graph")
    ? knowledgeGraphBackend(process.env)
    : knowledgeGraphBackend({}),
);
const tools = { ...fixtureTools(), ...campaignContext.tools, ...graph.tools };
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
  methodology: buildMethodology({ trialsDemo, trialsRouting }),
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
await campaignContext.close();
await graph.close();
console.log(`Wrote ${REPORT_PATH} (${results.length} turns).`);
