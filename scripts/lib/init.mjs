// The pure parts of `pnpm workbench:init`: turning answers into a profile, asking a local model
// to personalize a pack's vocabulary, merging the blocked-words list, and rendering the demo
// run-sheet. The CLI in scripts/workbench-init.mjs does the prompting and file writes.
import { z } from "zod";
import { PackIdSchema, PersonalizationSchema } from "../../packages/contracts/src/pack.ts";
import { InstanceProfileSchema } from "../../packages/contracts/src/profile.ts";
import { PACKS } from "../../packages/industry-packs/src/index.ts";

export const DEFAULT_CHAT = {
  provider: "ollama",
  model: "gpt-oss:20b",
  baseUrl: "http://127.0.0.1:11434/v1",
};

const ChatSchema = z.object({
  provider: z.enum(["ollama", "openai-compatible", "workers-ai", "bedrock"]),
  model: z.string().min(1),
  baseUrl: z.url().optional(),
});
const ImageSchema = z.object({
  provider: z.enum(["placeholder", "openai-compatible", "workers-ai"]),
  model: z.string().min(1).optional(),
  baseUrl: z.url().optional(),
});

/** What the wizard collects. Everything but the first four fields falls back to the pack. */
export const AnswersSchema = z.object({
  audience: z.enum(["internal", "external"]),
  pack: PackIdSchema,
  brand: z.string().trim().min(1).max(80),
  /** The real client's name: kept only in the ignored blocked-words list, never in the profile. */
  realClientName: z.string().trim().min(2).max(80).optional(),
  region: z.string().trim().min(1).default("United States"),
  language: z.string().trim().min(1).default("English"),
  brandVoice: z.string().trim().min(1).max(400).optional(),
  customerSegments: z.array(z.string().trim().min(1)).max(12).optional(),
  products: z.array(z.string().trim().min(1)).max(20).optional(),
  compliance: z.array(z.string().trim().min(1)).max(12).optional(),
  useCases: z.array(z.string()).min(1).optional(),
  chat: ChatSchema.default(DEFAULT_CHAT),
  image: ImageSchema.default({ provider: "placeholder" }),
  salesforce: z
    .object({
      mode: z.enum(["fixture", "sandbox"]).default("fixture"),
      mcpUrl: z.url().optional(),
      sampleCampaignId: z.string().optional(),
    })
    .default({ mode: "fixture" }),
  deploy: z.enum(["local", "cloudflare", "aws"]).default("local"),
  personalize: z.boolean().default(false),
});

export const slugify = (text) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 38);

/** Validates answers and returns the instance profile they describe. */
export function profileFromAnswers(rawAnswers) {
  const answers = AnswersSchema.parse(rawAnswers);
  const pack = PACKS[answers.pack];
  const useCases = answers.useCases ?? pack.useCases;
  const unknown = useCases.filter((id) => !pack.useCases.includes(id));
  if (unknown.length)
    throw new Error(`Use cases not offered by the ${pack.id} pack: ${unknown.join(", ")}`);
  if (answers.salesforce.mode === "sandbox" && !answers.salesforce.mcpUrl)
    throw new Error("A Salesforce sandbox needs the Hosted MCP server URL.");
  const id = `${slugify(answers.brand) || "demo"}-demo`;
  return InstanceProfileSchema.parse({
    instance: { id, displayName: `${answers.brand} workbench` },
    client: {
      brand: answers.brand,
      audience: answers.audience,
      pack: answers.pack,
      industry: pack.label,
      region: answers.region,
      language: answers.language,
      brandVoice: answers.brandVoice ?? pack.sample.brandVoice,
      customerSegments: answers.customerSegments ?? pack.sample.customerSegments,
      products: answers.products ?? pack.sample.products,
      compliance: answers.compliance ?? pack.sample.compliance,
    },
    useCases,
    models: { chat: answers.chat, image: answers.image },
    caps: {},
    retention: {},
    salesforce: answers.salesforce,
    deploy: { target: answers.deploy },
  });
}

/** Lists the models a local Ollama server has, or null when it isn't running. */
export async function detectOllama(baseUrl = DEFAULT_CHAT.baseUrl, fetchImpl = fetch) {
  const root = baseUrl.replace(/\/v1\/?$/, "").replace(/\/$/, "");
  try {
    const response = await fetchImpl(`${root}/api/tags`, { signal: AbortSignal.timeout(2500) });
    if (!response.ok) return null;
    const body = await response.json();
    return (body.models ?? []).map((model) => model.name);
  } catch {
    return null;
  }
}

const PII_SHAPES = [/@/, /\d{5,}/, /\b(?:mr|mrs|ms|dr)\.?\s/i, /https?:/i];

/**
 * Asks a chat model for fresh names for a pack's accounts and campaigns. Anything that doesn't
 * validate (wrong counts, duplicates, PII-shaped text, the real client's name) is rejected, and
 * the caller keeps the pack's own values.
 */
export async function personalizeVocabulary({
  pack,
  brand,
  industry,
  chat,
  forbidden = [],
  fetchImpl = fetch,
}) {
  const system =
    "You write fictional sample data for a marketing demo. Reply with one JSON object and nothing else. Invent every name: no real companies, no people, no emails, phone numbers or URLs.";
  const user = `Brand: ${brand}. Industry: ${industry}.
Return {"accounts": [...], "campaigns": [...]}.
"accounts": exactly 12 invented organizations that buy from or partner with this brand, 2 to 5 words each.
"campaigns": exactly 5 invented campaign names, 2 to 5 words each, in this order: a fall loyalty or reactivation program, a winter launch, a spring series, a holiday push, a summer promotion.`;
  const response = await fetchImpl(`${chat.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: chat.model,
      temperature: 0.7,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!response.ok) throw new Error(`The model endpoint answered ${response.status}.`);
  const text = (await response.json()).choices?.[0]?.message?.content ?? "";
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error("The model did not return JSON.");
  const parsed = z
    .object({ accounts: z.array(z.string()).length(12), campaigns: z.array(z.string()).length(5) })
    .parse(JSON.parse(json));
  const clean = (names) => {
    const trimmed = names.map((name) => name.trim());
    if (new Set(trimmed.map((name) => name.toLowerCase())).size !== trimmed.length)
      throw new Error("The model repeated a name.");
    for (const name of trimmed) {
      if (name.length < 3 || name.length > 60) throw new Error(`Name length: ${name}`);
      if (PII_SHAPES.some((shape) => shape.test(name))) throw new Error(`PII-shaped name: ${name}`);
      if (forbidden.some((word) => name.toLowerCase().includes(word.toLowerCase())))
        throw new Error("A name contains a blocked value.");
    }
    return trimmed;
  };
  const accounts = clean(parsed.accounts);
  const campaigns = clean(parsed.campaigns);
  return PersonalizationSchema.parse({
    vocabulary: {
      accounts: pack.vocabulary.accounts.map((account, index) => ({
        ...account,
        name: accounts[index],
      })),
      campaigns: pack.vocabulary.campaigns.map((campaign, index) => ({
        ...campaign,
        name: campaigns[index],
      })),
    },
  });
}

/** Adds a value to the blocked-words text without duplicating it. */
export function mergeBlockedWords(existing, value) {
  const lines = existing
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.some((line) => line.toLowerCase() === value.toLowerCase())) lines.push(value);
  return `${lines.join("\n")}\n`;
}

const bullet = (items) => items.map((item) => `- ${item}`).join("\n");

/** The presenter's run-sheet: setup checklist, the client in one paragraph, and one block per use case. */
export function renderDemoScript({ profile, pack, useCases, model }) {
  const { client } = profile;
  const external = client.audience === "external";
  const live = profile.salesforce.mode === "sandbox";
  const modelLine =
    model.reachable === false
      ? `No chat model answered at \`${model.baseUrl}\`. The workbench is in **scripted mode**: the fixtures answer the flows they cover, and a banner says so. Start Ollama (\`ollama pull ${model.name}\`) before a live demo.`
      : `Chat runs on \`${model.name}\` (${profile.models.chat.provider}).`;
  const blocks = useCases.map((useCase) => {
    const prompts = useCase.prompts.map(
      (prompt) => `   - “${prompt.text}” — shows: ${prompt.demonstrates}`,
    );
    return [
      `### ${useCase.title}`,
      "",
      useCase.scenario,
      "",
      "**Say:**",
      ...prompts,
      "",
      `**Writes:** ${useCase.writes}`,
      ...(useCase.watch.length ? ["", "**Point out:**", bullet(useCase.watch)] : []),
    ].join("\n");
  });
  return `# Demo run-sheet: ${client.brand}

Generated by \`pnpm workbench:init\`. Regenerate with \`pnpm workbench:script\`. This file is ignored by Git.

## About this demo

- **For:** ${external ? "an external client discussion" : "an internal session"}. ${external ? "A banner on every screen says the data is fictional." : ""}
- **Industry pack:** ${pack.label} (${pack.tier}).
- **Brand voice:** ${client.brandVoice}
- **Region and language:** ${client.region}, ${client.language}.
- **Salesforce:** ${live ? "a connected sandbox; connect it from the Salesforce agents panel first" : "fixtures: nothing leaves this machine and nothing is written to an external system"}.

## Before you start

${bullet([
  `Run \`pnpm dev\` and open http://127.0.0.1:5173.`,
  modelLine,
  "Open the Learn page once so you know where each concept is explained.",
  "Nothing is ever published or sent. Writes are drafts that wait for a confirmation click.",
])}

## What is live and what is scripted

${bullet([
  "Live: the chat model, tool selection, the knowledge graph, the confirmation flow, and read-back.",
  `Scripted: ${live ? "weather, news and other public feeds are live; everything else is Salesforce sandbox data" : "Salesforce results and writes use local fixtures; weather and news come from free public APIs when you are online"}.`,
  "Fictional: every customer, account and figure. Say so early if the audience might assume otherwise.",
])}

## Walkthrough

${blocks.join("\n\n")}

## Questions you may get

${bullet([
  "**Does it send anything?** No. Publish, send and activate are not exposed; only confirmed, reversible draft writes exist.",
  "**Where does the data go?** With the default profile, prompts stay on this machine (local model).",
  "**Can it use our data?** Not in this demo. It uses fictional data only; connecting real data is a separate engagement.",
])}
`;
}
