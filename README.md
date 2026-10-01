# Marketing Workbench: a demo playbook

A runnable, agent-first marketing workbench you can spin up for **a client discussion**, internal or external. It combines a React workspace, an orchestrator agent, a knowledge graph of fictional customer and campaign data, and (optionally) a Salesforce sandbox through governed tools. Everything runs on your own machine by default: a local web server, a local model, no cloud account.

You answer a few questions about the client, and the repository configures itself: the brand, the industry vocabulary, the use cases to show, and a run-sheet for presenting them.

## Quickstart (10 minutes)

Requirements: Node 26, pnpm 11, and (recommended) [Ollama](https://ollama.com) with about 16 GB of RAM for the default model.

```sh
git clone <your copy of this template> && cd <it>
pnpm install --frozen-lockfile
ollama pull gpt-oss:20b          # the default local model; skip it to run in scripted mode
pnpm workbench:init              # guided setup: industry, use cases, sample client profile…
pnpm dev                         # http://127.0.0.1:5173
```

`pnpm workbench:init` asks for:

| Question | Why |
| --- | --- |
| Internal session or external client discussion | External adds a "fictional data" banner to every screen |
| Industry | Picks an industry pack (vocabulary, vertical tools and data, use cases) |
| Sample client profile: brand, region, language, voice, segments, products, rules | Makes the data, prompts and screens speak for the client |
| Use cases to show | Limits the workbench to the scenarios you will present |
| Model runtime and image provider | Local Ollama by default; OpenAI-compatible, Workers AI or Bedrock are options |
| Salesforce: fixtures or a sandbox | Fixtures need no org and write nothing outside this machine |
| Where it will run | Local, Cloudflare or AWS |
| Personalize names with the local model | Optional: invented accounts and campaigns that fit the client |

It writes `workbench.profile.json`, compiles it, adds the real client's name (if you give one) to the ignored blocked-words list so it can never be committed, and writes **`.workbench/demo-script.md`**, a run-sheet with the prompts to say for each use case and what to point out. Skip the questions with `pnpm workbench:init --answers answers.json`.

No Ollama? The workbench still runs: fixtures answer the scripted flows, and the run-sheet says so. Start Ollama before a live demo to get open-ended answers.

## Industry packs

| Pack | Tier | What you get |
| --- | --- | --- |
| Retail and consumer brands | core | Loyalty, launch and seasonal campaigns, readiness checks, buyer groups, consent, content lineage |
| Restaurants and food service | vertical | The core flows plus weather-aware campaigns, store inventory risk and service recovery |
| Financial services and wealth management | vertical | The core flows plus pre-approved regulated content, market-news responses, embargoed announcements and account plans |
| Healthcare payers, B2B technology, travel and hospitality | core | The core flows with that industry's vocabulary and rules |
| Full tour | tour | Everything, for a multi-industry demonstration |

*Core* packs reuse the shared flows with the industry's names and rules. *Vertical* packs add industry-specific data, tools and scenarios. Adding a vertical means a new module (data, tools, scenarios); see [`docs/architecture.md`](docs/architecture.md).

## Running a client demo

1. Run `pnpm workbench:init` a day ahead; read `.workbench/demo-script.md` and rehearse the prompts.
2. Start Ollama and `pnpm dev`; open the Learn page once.
3. Say early that every customer, account and figure is fictional. For external audiences the banner does it for you.
4. Use the confirmation cards to show that nothing is written without a click, and the "Behind the scenes · technical trace" section under a reply to show what the agent did.
5. The default profile keeps prompts on your machine. If you pick a hosted model, tell the client where prompts go.

**What is real and what is not.** Real: the model, tool selection, the knowledge graph, the confirmation and read-back flow. Fictional: all data. Scripted: Salesforce results and writes unless you connect a sandbox. Never exposed: publish, send, activate, delete, arbitrary CRUD.

## Where to run it

| Target | When | Guide |
| --- | --- | --- |
| This machine (`pnpm dev`) | Default; presenting from your laptop | above |
| Docker Compose (workbench + Ollama) | A clean, repeatable local setup | [`templates/local/docker-compose.yml`](templates/local/docker-compose.yml) |
| Cloudflare (optional) | A shared, always-on URL behind Cloudflare Access | [`templates/cloudflare/README.md`](templates/cloudflare/README.md) |
| AWS (optional) | A shared URL on AWS with Bedrock models and Cognito sign-in | [`templates/aws/README.md`](templates/aws/README.md) |

No Cloudflare dependency is required for any of the first two. Cloudflare and AWS are opt-in templates; both deploy only after you confirm.

## Commands

- `pnpm dev`: the local server. `pnpm workbench:init`: guided setup. `pnpm workbench:script`: regenerate the run-sheet.
- `pnpm verify:fast` / `pnpm verify`: the quality gates (format, lint, types, tests, docs, template, Learn, evaluation, build).
- `pnpm eval:live`: measure a model against the evaluation suites (uses the full-tour profile).
- `pnpm template:check`: fails if instance files or a previous client's names are tracked.

## Making the repository yours

- Per-instance files (`workbench.profile.json`, `data/instance-dataset.json`, `.workbench/`, `.config/blocked-words.local`) are ignored by Git. Commit changes to the template, not your client.
- Mark your copy as a GitHub template in the repository settings if you want teammates to start from it.
- Agents working in the repository follow [`AGENTS.md`](AGENTS.md); start with [`docs/getting-started-for-agents.md`](docs/getting-started-for-agents.md).
- The earlier single-client proof this template grew out of is kept for reference in [`docs/archive/proof/`](docs/archive/proof/).

## Limits to know about

- The orchestrator runs in the open-source workerd runtime (the Cloudflare Workers runtime), also locally and on AWS. There is no plain-Node port.
- The AWS target is a single-instance demo deployment, not a scalable service.
- Local model quality varies. Measure it with `pnpm eval:live` before relying on open-ended answers.
- Salesforce metadata in `salesforce/` has not been deployed since it was renamed for the template; deploy to a sandbox and run its Apex tests before trusting it.
