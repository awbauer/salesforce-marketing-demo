// Guided setup for a new workbench instance.
//
//   pnpm workbench:init                       interactive
//   pnpm workbench:init --answers file.json   non-interactive (see scripts/lib/init.mjs AnswersSchema)
//
// Writes workbench.profile.json, optional data/instance-dataset.json (personalized names), the
// ignored blocked-words list, then compiles the profile and writes .workbench/demo-script.md.
// Flags: --root <dir> (write there instead of the repo), --skip-build, --verify, --force.
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as p from "@clack/prompts";
import { PACKS } from "../packages/industry-packs/src/index.ts";
import {
  AnswersSchema,
  DEFAULT_CHAT,
  detectOllama,
  mergeBlockedWords,
  personalizeVocabulary,
  profileFromAnswers,
} from "./lib/init.mjs";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) =>
  args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : undefined;
const root = value("root") ?? repo;
const answersFile = value("answers");
const profilePath = join(root, "workbench.profile.json");

const cancel = () => {
  p.cancel("Setup cancelled. Nothing was written.");
  process.exit(130);
};
const ask = async (promise) => {
  const answer = await promise;
  if (p.isCancel(answer)) cancel();
  return answer;
};
const list = (text) =>
  text
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

/** Use-case titles for the picker, read from the catalog so they never drift. */
async function loadUseCaseTitles() {
  try {
    const { ALL_USE_CASES } = await import("../apps/web/src/usecases/catalog.ts");
    return new Map(ALL_USE_CASES.map((useCase) => [useCase.id, useCase.title]));
  } catch {
    return new Map();
  }
}

async function interview() {
  p.intro("Marketing Workbench: set up a demo instance");
  if (existsSync(profilePath) && !flag("force")) {
    const overwrite = await ask(
      p.confirm({
        message: "This checkout already has a profile. Replace it?",
        initialValue: false,
      }),
    );
    if (!overwrite) {
      p.outro("Kept the existing profile. Run `pnpm dev` to use it.");
      process.exit(0);
    }
  }

  const audience = await ask(
    p.select({
      message: "Who is this demo for?",
      options: [
        {
          value: "internal",
          label: "An internal session",
          hint: "enablement, a practice, a colleague",
        },
        {
          value: "external",
          label: "An external client discussion",
          hint: "adds a 'fictional data' banner to every screen",
        },
      ],
    }),
  );
  const pack = await ask(
    p.select({
      message: "Which industry is the client in?",
      options: Object.values(PACKS)
        .filter((candidate) => candidate.id !== "composite")
        .map((candidate) => ({
          value: candidate.id,
          label: candidate.label,
          hint:
            candidate.tier === "vertical"
              ? "industry-specific tools and data"
              : "core marketing flows, industry vocabulary",
        }))
        .concat([
          {
            value: "composite",
            label: PACKS.composite.label,
            hint: "everything, for a multi-industry tour",
          },
        ]),
    }),
  );
  const chosen = PACKS[pack];

  p.log.step("Sample client profile");
  const brand = await ask(
    p.text({
      message: "Brand name to show in the demo",
      placeholder: "Acme Outfitters",
      validate: (input) => (input.trim() ? undefined : "Enter a name"),
    }),
  );
  const realClientName = await ask(
    p.text({
      message:
        "The real client's name, if different (kept only in your ignored blocked-words list)",
      placeholder: "leave blank to skip",
    }),
  );
  const region = await ask(p.text({ message: "Region", initialValue: "United States" }));
  const language = await ask(p.text({ message: "Language", initialValue: "English" }));
  const brandVoice = await ask(
    p.text({ message: "Brand voice", initialValue: chosen.sample.brandVoice }),
  );
  const customerSegments = list(
    await ask(
      p.text({
        message: "Key customer segments (comma separated)",
        initialValue: chosen.sample.customerSegments.join(", "),
      }),
    ),
  );
  const products = list(
    await ask(
      p.text({
        message: "Products or services (comma separated)",
        initialValue: chosen.sample.products.join(", "),
      }),
    ),
  );
  const compliance = list(
    await ask(
      p.text({
        message: "Rules every message must follow (comma separated)",
        initialValue: chosen.sample.compliance.join(", "),
      }),
    ),
  );

  const titles = await loadUseCaseTitles();
  const useCases = await ask(
    p.multiselect({
      message: "Which use cases will you show?",
      options: chosen.useCases.map((id) => ({ value: id, label: titles.get(id) ?? id })),
      initialValues: chosen.useCases,
      required: true,
    }),
  );

  p.log.step("Models");
  const installed = await detectOllama();
  p.log.info(
    installed
      ? `Ollama is running with: ${installed.join(", ") || "no models yet"}.`
      : "Ollama was not found on 127.0.0.1:11434. Install it from https://ollama.com to run models locally.",
  );
  const runtime = await ask(
    p.select({
      message: "Where should the chat model run?",
      options: [
        {
          value: "ollama",
          label: "Local Ollama",
          hint: `${DEFAULT_CHAT.model} (recommended; ~16 GB RAM)`,
        },
        {
          value: "openai-compatible",
          label: "Another OpenAI-compatible endpoint",
          hint: "LM Studio, vLLM, a gateway",
        },
        {
          value: "workers-ai",
          label: "Cloudflare Workers AI",
          hint: "needs the Cloudflare deploy target",
        },
        { value: "bedrock", label: "Amazon Bedrock", hint: "needs AWS credentials" },
      ],
    }),
  );
  let chat = { ...DEFAULT_CHAT, provider: runtime };
  if (runtime === "ollama") {
    chat.model = await ask(p.text({ message: "Model", initialValue: DEFAULT_CHAT.model }));
    if (installed && !installed.includes(chat.model)) {
      const pull = await ask(
        p.confirm({ message: `Pull ${chat.model} now? (large download)`, initialValue: false }),
      );
      if (pull) spawnSync("ollama", ["pull", chat.model], { stdio: "inherit" });
    }
  } else if (runtime === "openai-compatible") {
    chat.baseUrl = await ask(p.text({ message: "Base URL (ending in /v1)" }));
    chat.model = await ask(p.text({ message: "Model name" }));
  } else {
    chat = {
      provider: runtime,
      model: await ask(
        p.text({
          message: "Model id",
          initialValue: runtime === "bedrock" ? "openai.gpt-oss-20b-1:0" : "@cf/openai/gpt-oss-20b",
        }),
      ),
    };
  }
  const image = await ask(
    p.select({
      message: "Campaign images",
      options: [
        { value: "placeholder", label: "Placeholder renderer", hint: "local, no model needed" },
        { value: "openai-compatible", label: "OpenAI-compatible image endpoint" },
        { value: "workers-ai", label: "Cloudflare Workers AI (FLUX)" },
      ],
    }),
  );
  const imageConfig = { provider: image };
  if (image === "openai-compatible") {
    imageConfig.baseUrl = await ask(p.text({ message: "Image endpoint base URL" }));
    imageConfig.model = await ask(p.text({ message: "Image model name" }));
  }

  p.log.step("Integrations");
  const sfMode = await ask(
    p.select({
      message: "Salesforce",
      options: [
        { value: "fixture", label: "Fixtures only", hint: "no org needed" },
        { value: "sandbox", label: "Connect a sandbox", hint: "needs a Hosted MCP server URL" },
      ],
    }),
  );
  const salesforce = { mode: sfMode };
  if (sfMode === "sandbox") {
    salesforce.mcpUrl = await ask(p.text({ message: "Hosted MCP server URL" }));
    const campaign = await ask(
      p.text({ message: "Sample Campaign record id in the sandbox", placeholder: "optional" }),
    );
    if (campaign.trim()) salesforce.sampleCampaignId = campaign.trim();
  }
  const deploy = await ask(
    p.select({
      message: "Where will you run it?",
      options: [
        { value: "local", label: "On this machine" },
        { value: "cloudflare", label: "Cloudflare", hint: "see templates/cloudflare/README.md" },
        { value: "aws", label: "AWS", hint: "see templates/aws/README.md" },
      ],
    }),
  );

  const canPersonalize = chat.provider === "ollama" && installed?.includes(chat.model);
  const personalize = canPersonalize
    ? await ask(
        p.confirm({
          message: "Ask the local model to invent names that fit this client?",
          initialValue: true,
        }),
      )
    : false;

  return {
    audience,
    pack,
    brand: brand.trim(),
    ...(realClientName.trim() ? { realClientName: realClientName.trim() } : {}),
    region,
    language,
    brandVoice,
    customerSegments,
    products,
    compliance,
    useCases,
    chat,
    image: imageConfig,
    salesforce,
    deploy,
    personalize,
  };
}

async function main() {
  const raw = answersFile ? JSON.parse(readFileSync(answersFile, "utf8")) : await interview();
  const answers = AnswersSchema.parse(raw);
  const profile = profileFromAnswers(answers);
  const pack = PACKS[answers.pack];
  const spin = answersFile ? null : p.spinner();

  mkdirSync(root, { recursive: true });
  writeFileSync(profilePath, `${JSON.stringify(profile, null, 2)}\n`);

  const dataPath = join(root, "data/instance-dataset.json");
  if (answers.personalize) {
    spin?.start("Asking the local model for fitting names");
    try {
      const personalization = await personalizeVocabulary({
        pack,
        brand: answers.brand,
        industry: pack.label,
        chat: {
          ...profile.models.chat,
          baseUrl: profile.models.chat.baseUrl ?? DEFAULT_CHAT.baseUrl,
        },
        forbidden: answers.realClientName ? [answers.realClientName] : [],
      });
      mkdirSync(dirname(dataPath), { recursive: true });
      writeFileSync(dataPath, `${JSON.stringify(personalization, null, 2)}\n`);
      spin?.stop("Names personalized");
    } catch (error) {
      spin?.stop(`Kept the pack's own names (${error.message})`);
    }
  }

  if (answers.realClientName) {
    const blocked = join(root, ".config/blocked-words.local");
    mkdirSync(dirname(blocked), { recursive: true });
    const existing = existsSync(blocked) ? readFileSync(blocked, "utf8") : "";
    writeFileSync(blocked, mergeBlockedWords(existing, answers.realClientName));
    chmodSync(blocked, 0o600);
  }

  if (!flag("skip-build")) {
    const run = (command, commandArgs) =>
      spawnSync(command, commandArgs, { cwd: repo, stdio: answersFile ? "ignore" : "inherit" });
    spin?.start("Compiling the profile");
    const built = run("node", ["scripts/build-profile.mjs"]);
    if (built.status !== 0) throw new Error("pnpm profile:build failed; see the output above.");
    run("node", ["scripts/make-demo-script.mjs"]);
    spin?.stop("Profile compiled and run-sheet written");
    if (flag("verify")) {
      const verify = spawnSync("pnpm", ["verify:fast"], { cwd: repo, stdio: "inherit" });
      if (verify.status !== 0) throw new Error("pnpm verify:fast failed; see the output above.");
    }
  }

  const lines = [
    `Profile:      workbench.profile.json (${pack.label}, ${profile.client.audience})`,
    "Run:          pnpm dev  →  http://127.0.0.1:5173",
    "Run-sheet:    .workbench/demo-script.md",
    ...(answers.realClientName
      ? ["Blocked:      the real client name is in .config/blocked-words.local"]
      : [
          "Blocked:      no real client name given; add one to .config/blocked-words.local if needed",
        ]),
    ...(profile.deploy.target !== "local"
      ? [`Deploy:       templates/${profile.deploy.target}/README.md`]
      : []),
  ];
  if (answersFile) console.log(lines.join("\n"));
  else p.outro(lines.join("\n"));
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
