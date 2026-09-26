/**
 * Learn page content: a primer on context and GraphRAG, then an in-depth explainer for each
 * concept the Northstar demo uses. Bodies are Markdown; every resource link was checked to resolve.
 */

export type Resource = {
  label: string;
  url: string;
  kind: "Guide" | "Docs" | "Paper" | "Course" | "Spec" | "Code";
};

export type LearnSection = {
  id: string;
  title: string;
  summary: string;
  body: string;
  /** Where to see it in this demo: UI surfaces and source paths. */
  inDemo?: string[];
  resources: Resource[];
};

export type LearnPart = { id: string; title: string; intro: string; sections: LearnSection[] };

const R = {
  contextEngineering: {
    label: "Effective context engineering for AI agents (Anthropic)",
    url: "https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents",
    kind: "Guide",
  },
  buildingAgents: {
    label: "Building effective agents (Anthropic)",
    url: "https://www.anthropic.com/engineering/building-effective-agents",
    kind: "Guide",
  },
  writingTools: {
    label: "Writing effective tools for agents (Anthropic)",
    url: "https://www.anthropic.com/engineering/writing-tools-for-agents",
    kind: "Guide",
  },
  lostInTheMiddle: {
    label: "Lost in the Middle: How Language Models Use Long Contexts",
    url: "https://arxiv.org/abs/2307.03172",
    kind: "Paper",
  },
  rag: {
    label: "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks",
    url: "https://arxiv.org/abs/2005.11401",
    kind: "Paper",
  },
  graphragPaper: {
    label: "From Local to Global: A Graph RAG Approach (Microsoft Research)",
    url: "https://arxiv.org/abs/2404.16130",
    kind: "Paper",
  },
  msGraphrag: {
    label: "Microsoft GraphRAG project",
    url: "https://microsoft.github.io/graphrag/",
    kind: "Docs",
  },
  neo4jGraphrag: {
    label: "What is GraphRAG? (Neo4j)",
    url: "https://neo4j.com/blog/genai/what-is-graphrag/",
    kind: "Guide",
  },
  neo4jGraphragPython: {
    label: "Neo4j GraphRAG for Python",
    url: "https://neo4j.com/docs/neo4j-graphrag-python/current/",
    kind: "Docs",
  },
  graphDb: {
    label: "Graph database concepts (Neo4j)",
    url: "https://neo4j.com/docs/getting-started/graph-database/",
    kind: "Docs",
  },
  cypher: {
    label: "Cypher manual: introduction",
    url: "https://neo4j.com/docs/cypher-manual/current/introduction/",
    kind: "Docs",
  },
  queryApi: {
    label: "Neo4j Aura Query API",
    url: "https://neo4j.com/docs/aura/connecting-applications/query-api/",
    kind: "Docs",
  },
  graphAcademy: {
    label: "Neo4j GraphAcademy (free courses)",
    url: "https://graphacademy.neo4j.com/",
    kind: "Course",
  },
  neo4jMcp: {
    label: "Official Neo4j MCP server",
    url: "https://github.com/neo4j/mcp",
    kind: "Code",
  },
  agentforceNeo4j: {
    label: "Salesforce Agentforce + Neo4j (Neo4j Labs)",
    url: "https://neo4j.com/labs/genai-ecosystem/genai-frameworks/salesforce-agentforce/",
    kind: "Guide",
  },
  mcpIntro: {
    label: "Model Context Protocol: introduction",
    url: "https://modelcontextprotocol.io/docs/getting-started/intro",
    kind: "Docs",
  },
  mcpSpec: {
    label: "MCP specification (2025-06-18)",
    url: "https://modelcontextprotocol.io/specification/2025-06-18",
    kind: "Spec",
  },
  cfAgents: {
    label: "Cloudflare Agents SDK",
    url: "https://developers.cloudflare.com/agents/",
    kind: "Docs",
  },
  cfChatAgents: {
    label: "Cloudflare chat agents",
    url: "https://developers.cloudflare.com/agents/api-reference/chat-agents/",
    kind: "Docs",
  },
  cfMcp: {
    label: "MCP on Cloudflare",
    url: "https://developers.cloudflare.com/agents/model-context-protocol/",
    kind: "Docs",
  },
  durableObjects: {
    label: "Cloudflare Durable Objects",
    url: "https://developers.cloudflare.com/durable-objects/",
    kind: "Docs",
  },
  workersAi: {
    label: "Cloudflare Workers AI",
    url: "https://developers.cloudflare.com/workers-ai/",
    kind: "Docs",
  },
  aiGateway: {
    label: "Cloudflare AI Gateway",
    url: "https://developers.cloudflare.com/ai-gateway/",
    kind: "Docs",
  },
  gptOss20b: {
    label: "gpt-oss-20b on Workers AI",
    url: "https://developers.cloudflare.com/workers-ai/models/gpt-oss-20b/",
    kind: "Docs",
  },
  gptOssRepo: { label: "openai/gpt-oss", url: "https://github.com/openai/gpt-oss", kind: "Code" },
  harmony: {
    label: "The harmony response format (OpenAI Cookbook)",
    url: "https://cookbook.openai.com/articles/openai-harmony",
    kind: "Guide",
  },
  aiSdk: {
    label: "AI SDK: introduction",
    url: "https://ai-sdk.dev/docs/introduction",
    kind: "Docs",
  },
  aiSdkTools: {
    label: "AI SDK: tools and tool calling",
    url: "https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling",
    kind: "Docs",
  },
  react: {
    label: "ReAct: Synergizing Reasoning and Acting in Language Models",
    url: "https://arxiv.org/abs/2210.03629",
    kind: "Paper",
  },
  hostedMcp: {
    label: "Salesforce Hosted MCP servers reference",
    url: "https://developer.salesforce.com/docs/platform/hosted-mcp-servers/guide/servers-reference.html",
    kind: "Docs",
  },
  hxl: {
    label: "HXL widgets for Agentforce action output",
    url: "https://developer.salesforce.com/docs/platform/hxl/guide/agentforce-action-output.html",
    kind: "Docs",
  },
  agentforceTrailhead: {
    label: "Introduction to Agentforce (Trailhead)",
    url: "https://trailhead.salesforce.com/content/learn/modules/introduction-to-agentforce",
    kind: "Course",
  },
  agentforce: {
    label: "Salesforce Agentforce",
    url: "https://www.salesforce.com/agentforce/",
    kind: "Guide",
  },
  owaspLlm: {
    label: "OWASP Top 10 for LLM Applications",
    url: "https://owasp.org/www-project-top-10-for-large-language-model-applications/",
    kind: "Guide",
  },
  evals: {
    label: "Your AI product needs evals (Hamel Husain)",
    url: "https://hamel.dev/blog/posts/evals/",
    kind: "Guide",
  },
  openMeteo: { label: "Open-Meteo API docs", url: "https://open-meteo.com/en/docs", kind: "Docs" },
  r2: { label: "Cloudflare R2", url: "https://developers.cloudflare.com/r2/", kind: "Docs" },
  d1: { label: "Cloudflare D1", url: "https://developers.cloudflare.com/d1/", kind: "Docs" },
  flux: {
    label: "FLUX.2 klein 4B on Workers AI",
    url: "https://developers.cloudflare.com/workers-ai/models/flux-2-klein-4b/",
    kind: "Docs",
  },
  wcag: {
    label: "WCAG overview (W3C)",
    url: "https://www.w3.org/WAI/standards-guidelines/wcag/",
    kind: "Guide",
  },
  reactMarkdown: {
    label: "react-markdown",
    url: "https://github.com/remarkjs/react-markdown",
    kind: "Code",
  },
} satisfies Record<string, Resource>;

export const LEARN_PARTS: LearnPart[] = [
  {
    id: "context",
    title: "Primer: context",
    intro:
      "Everything a model knows during a turn is its **context**. Most agent quality problems, such as forgetting, hallucinating, or acting on stale facts, are context problems. This part explains what context is, how this demo manages it, and what can go wrong.",
    sections: [
      {
        id: "what-is-context",
        title: "What context is",
        summary: "The model only sees what is in its context window for this one call.",
        body: `A language model has no memory between calls. Each time the orchestrator asks the model for a turn, it sends a **context window**: a bounded sequence of tokens that is all the model can see. In this demo that window contains:

- **System instructions:** the orchestrator's rules, such as "Salesforce tool results are the only authority" and "never claim a write happened".
- **Tool definitions:** names, descriptions, and JSON input schemas for every tool the model may call on this step.
- **Conversation messages:** the recent user and assistant messages.
- **Tool results:** what each tool returned earlier in this turn.

**Context engineering** is deciding what goes into that window, in what form, and what stays out. More is not better. Long, noisy windows dilute attention ("context rot"), cost more, and give stale or injected text a chance to steer the model. Good context is the *smallest* set of high-signal information that lets the model do the next step well.`,
        inDemo: [
          "System prompt: apps/edge/src/turn-policy.ts (orchestratorSystemPrompt)",
          "Technical trace under each answer shows what the model did with its context",
        ],
        resources: [R.contextEngineering, R.lostInTheMiddle, R.buildingAgents],
      },
      {
        id: "memory-layers",
        title: "Three layers of memory",
        summary:
          "Working memory, the audit trail, and long-term memory each live somewhere different.",
        body: `"Session context" is really three different things with different lifetimes and owners:

| Layer | Holds | Lives in | Lifetime |
|---|---|---|---|
| **Working memory** | The current conversation | Each user's agent Durable Object (chat messages) | Until **New chat** |
| **Audit trail** | What each turn did: route, tools, inputs and outputs, outcome | Agent SQLite (turn history) | 14 days |
| **Long-term memory** | Decisions and drafts that matter across chats | Knowledge graph, linked to the entities involved | 14 days (planned, issue #41) |

**Working memory** is sent to the model as a bounded window: the last 8 messages. Earlier assistant replies are reduced to their text, so old tool results and reasoning never re-enter the prompt. That's what lets "looks good, create it" understand what "it" is.

**The audit trail** is never sent to the model. It exists for people: the History view and the audit export.

**Long-term memory** belongs in the graph because it's retrieved *by relationship* ("what did we decide about the fall campaign?"), not by recency, and it needs provenance.`,
        inDemo: [
          "History view (turn history and audit export)",
          "apps/edge/src/orchestrator.ts (conversationWindow)",
          "Issue #41: long-term graph memory",
        ],
        resources: [R.contextEngineering, R.durableObjects, R.cfChatAgents],
      },
      {
        id: "context-risks",
        title: "What goes wrong with context, and the defenses here",
        summary:
          "Stale claims, prompt injection, and overflow, plus the guards this demo uses against each.",
        body: `**Stale or unsupported claims.** If an earlier answer said something wrong and it stays in the window, the model tends to repeat it as fact. Defense: earlier replies are *context, not evidence*. The system prompt requires re-checking Salesforce facts with tools each turn, and old tool results are stripped from history.

**Prompt injection.** Text inside data, such as a campaign description saying "ignore previous instructions", can try to steer the model. Defenses:
- The model has **no write tools**; writes need a human confirmation.
- A **policy router** answers write and forbidden requests without calling the model.
- Tool results are treated as data.
- The Apex readiness check flags instruction-like text.

**Overflow and truncation.** Workers AI defaults to 256 output tokens, which gpt-oss's reasoning could use up before any answer. Defenses: an explicit 4,096-token budget, forced text-only summary steps, and a recovery message if a turn still ends empty.`,
        inDemo: [
          "apps/edge/src/turn-policy.ts (system rules)",
          "packages/contracts/src/index.ts (classifyPolicyIntent)",
          'Evaluations view: "No false write claims" check',
        ],
        resources: [R.owaspLlm, R.contextEngineering],
      },
    ],
  },
  {
    id: "graphrag",
    title: "Primer: RAG and GraphRAG",
    intro:
      "**Retrieval-augmented generation (RAG)** grounds a model in data it was not trained on by retrieving relevant facts into its context. **GraphRAG** retrieves from a knowledge graph, so answers can follow relationships and show the path to their evidence.",
    sections: [
      {
        id: "rag",
        title: "RAG in one page",
        summary:
          "Retrieve relevant facts, add them to the context, then generate an answer grounded in them.",
        body: `Plain RAG has three steps:

1. **Retrieve.** Find the pieces of data most relevant to the question, usually by embedding text into vectors and running a similarity search.
2. **Augment.** Put those pieces into the model's context with the question.
3. **Generate.** The model answers from the retrieved facts instead of its training data.

RAG is excellent for "find the passage that answers this". It struggles when the answer depends on **connections** between facts spread across many documents. For example: *which accounts engaged with content from two campaigns and also lack SMS consent?* Similarity search finds similar text; it doesn't join facts.

In this demo, tool calls are a form of retrieval: the Salesforce agents and the graph tools fetch facts at answer time.`,
        resources: [R.rag, R.buildingAgents],
      },
      {
        id: "graphrag-explained",
        title: "GraphRAG",
        summary:
          "Retrieve connected facts from a knowledge graph and return the paths as evidence.",
        body: `A **knowledge graph** stores entities (**nodes**, such as a Persona, a Campaign, or a MenuItem) and typed **relationships** between them (\`ENGAGED_WITH\`, \`TARGETS\`, \`FEATURED\`). **GraphRAG** retrieves by traversing those relationships.

There are several common patterns:

- **Curated graph queries** (used here): the model picks from fixed, parameterized queries such as *explain buyer group*. This is predictable, safe, fast, and easy to evaluate.
- **Text-to-Cypher:** the model writes graph queries itself. It's flexible, but riskier and harder to govern.
- **Hybrid vector + graph:** vector search finds entry points, then graph traversal expands to connected context.
- **Community summaries:** Microsoft's GraphRAG clusters the graph into communities and pre-summarizes them to answer global "what are the themes?" questions.

GraphRAG's advantages are **multi-hop reasoning** and **explainability**. Every answer can carry the path that justifies it, which the demo shows in the **Graph evidence** panel.`,
        resources: [
          R.graphragPaper,
          R.msGraphrag,
          R.neo4jGraphrag,
          R.neo4jGraphragPython,
          R.graphDb,
        ],
      },
      {
        id: "graphrag-here",
        title: "How this demo does GraphRAG",
        summary: "Six read-only, curated graph tools over Neo4j, each returning evidence paths.",
        body: `- **The graph:** a deterministic, fictional dataset of about 1,600 nodes and 6,500 relationships, covering accounts, buying-role personas, campaigns, segments, content, brand rules, consent scopes, and Coastline Kitchen's menu, locations, dayparts, weather buckets, and 1,500 past push sends.
- **The store:** Neo4j AuraDB, reached over the HTTPS **Query API**, because Workers can't open Bolt connections. Every query runs in **read access mode**, so the database itself rejects writes.
- **The tools:** \`explain_buyer_group\`, \`find_audience_overlap\`, \`check_consent_coverage\`, \`find_similar_past_pushes\`, \`trace_content_lineage\`, and \`get_graph_overview\`. Each returns an answer plus up to 25 **evidence paths**.
- **Parity:** every tool also has an in-memory implementation over the same dataset. \`pnpm kg:parity\` proves both return identical results, so local development and evals match production.
- **In a flow:** the restaurant push campaign calls \`find_similar_past_pushes\` to learn what worked before in the same weather and daypart, then passes that to the Salesforce content tool.`,
        inDemo: [
          "Quickstart: “Who should be in the buyer group for Acme Outfitters, and why?”",
          "Graph evidence panel under answers; “Knowledge graph · Neo4j” in Sources",
          "packages/knowledge-graph, apps/edge/src/knowledge-graph",
        ],
        resources: [R.cypher, R.queryApi, R.graphAcademy, R.neo4jMcp, R.agentforceNeo4j],
      },
    ],
  },
  {
    id: "concepts",
    title: "Every concept in the demo",
    intro: "Each piece of the workbench, how it works, and where to see it.",
    sections: [
      {
        id: "orchestrator",
        title: "The orchestrator agent",
        summary: "A stateful Cloudflare agent per user that runs each chat turn.",
        body: `The **orchestrator** is a Cloudflare **Agents SDK** chat agent running in a **Durable Object**: a single-threaded, stateful instance with its own SQLite storage.
- Each user gets their own instance, keyed by a hash of their Access identity and the workspace, so conversations and history are isolated by construction.
- Each turn streams to the browser over a WebSocket, and the stream is **resumable** if the tab reconnects.

A turn runs a **tool loop** of up to 6 steps. On each step the model either calls a tool or writes the answer. The orchestrator decides which tools are available on each step (see *Routing*) and records a **turn trace** of every event.`,
        inDemo: [
          "apps/edge/src/orchestrator.ts",
          "“Behind the scenes · technical trace” under each answer",
        ],
        resources: [R.cfAgents, R.cfChatAgents, R.durableObjects, R.aiSdk, R.react],
      },
      {
        id: "model",
        title: "The model: gpt-oss-20b on Workers AI",
        summary: "An open-weight reasoning model served at the edge, chosen by evaluation.",
        body: `The orchestrator runs **gpt-oss-20b**, OpenAI's open-weight reasoning model, on **Cloudflare Workers AI**, routed through **AI Gateway** for logging and cost visibility. The model ID is set in exactly one place: \`PROOF_DEFAULTS.orchestratorModel\`.

- **Why 20b:** after the routing and reliability fixes, it matched or beat gpt-oss-120b through the pipeline at about 60% of the latency and lower cost (see *Evaluations*).
- **Its quirks** shaped several guards. It sometimes writes a tool call into its reasoning or answer text instead of calling the tool, and leaks its internal "harmony" channel markup into tool names.`,
        inDemo: [
          "packages/contracts/src/index.ts (PROOF_DEFAULTS)",
          "Evaluations view: model comparison",
          "docs/decisions/ADR-005",
        ],
        resources: [R.gptOss20b, R.gptOssRepo, R.harmony, R.workersAi, R.aiGateway],
      },
      {
        id: "mcp",
        title: "Tools and the Model Context Protocol (MCP)",
        summary:
          "A standard way for agents to discover and call tools, and the three MCP servers here.",
        body: `**Tool calling** lets a model ask the host to run a function with structured arguments and get the result back. **MCP** standardizes this: a server advertises tools (a name, a description, and a JSON Schema for input), and clients list and call them over a transport such as streamable HTTP.

The demo uses three MCP servers:

| Server | Tools | How it's reached |
|---|---|---|
| **Salesforce Hosted MCP** | 14 governed tools backed by Agentforce agents and Apex actions | Remote, with per-user OAuth |
| **Campaign context** | Restaurant profile (mocked) and live weather (Open-Meteo) | In-process; also at \`/mcp/campaign-context\` |
| **Knowledge graph** | Six curated Neo4j queries | In-process; also at \`/mcp/knowledge-graph\` |

The two local servers are called **in-process** through an in-memory MCP transport. The orchestrator uses the real protocol without a network hop, and external MCP clients can still reach the same servers over HTTP, behind Cloudflare Access.`,
        inDemo: [
          "Sources list in the left rail",
          "apps/edge/src/campaign-context, apps/edge/src/knowledge-graph",
          "salesforce/…/mcpServerDefinitions",
        ],
        resources: [R.mcpIntro, R.mcpSpec, R.cfMcp, R.writingTools, R.aiSdkTools],
      },
      {
        id: "salesforce",
        title: "Salesforce: Agentforce agents, Hosted MCP, and Apex actions",
        summary:
          "Salesforce is the system of record, and every Salesforce fact comes from its tools.",
        body: `Salesforce is **authoritative** for campaign data. The orchestrator never invents Salesforce facts. It calls tools on a **Salesforce Hosted MCP server**:

- **Agent-backed tools:** summarize a campaign, check readiness, draft content, and account discovery. These call **Agentforce** agents defined as Agent Script bundles.
- **Write tools:** save a brief, create a review task, and attach an image. These are global **Apex invocable actions** and are never available to the model; only the confirmation flow can run them.

Metadata (Apex, fields, the permission set, and the MCP definition) deploys through a gated CI pipeline to one approved proof org.`,
        inDemo: [
          "Quickstart prompts 1–3",
          "salesforce/force-app",
          "docs/salesforce-deployment-pipeline.md",
        ],
        resources: [R.hostedMcp, R.agentforceTrailhead, R.agentforce],
      },
      {
        id: "routing",
        title: "Routing: policy router, intent router, and tool plans",
        summary: "Deterministic decisions before and around the model.",
        body: `Not every decision should be left to the model. Each turn passes through two deterministic routers:

1. **Policy router.** Save, create, or change requests get a fixed reply pointing to the confirmation flow. Publish, send, delete, and similar requests are refused. Neither case calls the model, so it can never claim a write happened.
2. **Intent router.** Clear intents force a **tool plan**: an ordered list of tools, one forced per step.
   - "Check readiness" → \`check_campaign_readiness\`
   - "Why is X in the buyer group?" → \`explain_buyer_group\`
   - A restaurant push campaign → profile → weather → past pushes → content draft
   - The rules need specific signals and **defer to the model** when unsure, because a wrongly forced tool can't be undone within the turn.

After a plan finishes, the model gets **no tools** and must write the answer.`,
        inDemo: ["apps/edge/src/turn-policy.ts", "Turn history: “Interpretation” for each turn"],
        resources: [R.buildingAgents, R.writingTools],
      },
      {
        id: "reliability",
        title: "Reliability guards for tool calling",
        summary: "How the demo keeps a small model's tool calls on track.",
        body: `Small reasoning models fail at tool calling in predictable ways. The forced-tool guard, a language-model middleware, handles each one:

- **A tool call written into reasoning or answer text.** The guard recovers the JSON arguments when they match the tool's schema, and hides leaked text from the user.
- **Channel markup or a dropped prefix in tool names**, such as \`summarize_campaign<|channel|>analysis\`. The guard repairs the name when exactly one real tool matches.
- **No usable call at all.** The step is retried once.
- **Runaway reasoning.** Forced steps are capped at 1,024 tokens.

At the turn level:
- Structured timeouts cover the whole turn, gaps between chunks, and each tool call.
- Errors and empty answers become an explanatory message instead of a silent failure.
- Workers AI capacity errors are explained in plain language.`,
        inDemo: [
          "apps/edge/src/forced-tool-middleware.ts",
          "apps/edge/src/turn-trace.ts",
          "Technical trace: “Recovery message added”",
        ],
        resources: [R.aiSdkTools, R.harmony],
      },
      {
        id: "governance",
        title: "Governance: confirmations, allowed writes, and kill switches",
        summary: "Humans approve every write, and operators can turn things off.",
        body: `Only three writes exist: save a draft brief, create a review task, and attach a selected image. Each one follows the same flow:

1. **Preflight:** the server creates a confirmation bound to the exact arguments with a SHA-256 request hash, an idempotency key, and a 5-minute expiry.
2. **Human confirmation:** the confirmation card shows what will change.
3. **Execute:** the Worker signs the confirmation with HMAC. Apex verifies the signature, the expiry, the same user, and the hash before writing.
4. **Read-back:** Salesforce returns the authoritative record, which is checked before the UI reports success.

**Kill switches** (\`WRITES_ENABLED\`, \`DISABLED_TOOLS\`) are Worker secrets that operators can flip without a deploy. The knowledge graph is read-only at the database level. No customer PII enters prompts, logs, or the graph.`,
        inDemo: [
          "Create review request → confirmation card",
          "Attach to campaign on a generated image",
          "infra/cloudflare/pot/README.md (operator runbook)",
        ],
        resources: [R.owaspLlm, R.buildingAgents],
      },
      {
        id: "ui",
        title: "Structured UI: Markdown, HXL cards, and native fallbacks",
        summary: "Answers render as rich text, and records render as governed cards.",
        body: `- **Markdown answers.** The model may use concise Markdown. The UI renders it with \`react-markdown\`, which never renders raw HTML, so model output can't inject markup.
- **HXL cards.** Salesforce's HXL widgets (MCP Apps) let an agent action return a typed, interactive card, such as campaign readiness. When a host can't render HXL, the workbench shows an equivalent accessible **native fallback** built from the same contract.
- **Graph evidence panel.** Knowledge-graph paths render as directional chains, each with a text alternative for screen readers.
- **Accessibility.** The UI targets WCAG 2.2 AA and is tested in Chrome and Edge.`,
        inDemo: [
          "Insights panel (readiness card with native fallback)",
          "apps/web/src/Markdown.tsx, apps/web/src/GraphEvidence.tsx",
        ],
        resources: [R.hxl, R.reactMarkdown, R.wcag],
      },
      {
        id: "observability",
        title: "Observability: technical trace, turn history, and audit export",
        summary: "See exactly what happened in every turn.",
        body: `- **Technical trace** under each answer: every lifecycle event in order, with timing.
  - turn start, step start and finish (finish reason, token counts)
  - reasoning start and end, with the model's reasoning, redacted
  - text start and end
  - tool input and output, errors, recovery messages, and the outcome
- **Turn history** (History view): each utterance with the orchestrator's interpretation, the tool calls with inputs and results, and the outcome. Filterable, and kept 14 days per user.
- **Audit export:** a JSON download of the user's confirmed writes and turn summaries.`,
        inDemo: [
          "Any answer → “Behind the scenes · technical trace”",
          "History view → Export audit (JSON)",
        ],
        resources: [R.aiGateway, R.contextEngineering],
      },
      {
        id: "evaluations",
        title: "Evaluations",
        summary: "Measure the whole pipeline across models, and publish the real results.",
        body: `\`pnpm eval:live\` runs the **production pipeline**: policy router, intent router, prompt, guards, and step settings, against live Workers AI models. Three suites:

- **Demo scenarios:** the Quickstart prompts, through the full pipeline.
- **Routing through the pipeline:** 20 prompts, as evaluators experience them.
- **Routing by the model alone:** the same prompts with no routers, isolating model quality.

Each turn is scored on **right tool** (or the right plan in order), **answered**, **no tool errors**, and **no false write claims**, plus latency and tokens.

Salesforce tools are fixtures, so the scores measure orchestration, not Salesforce agent quality. A held-out set of paraphrases guards the router against overfitting. The first published run found a real routing bug: any prompt mentioning "campaign" forced the summary tool.`,
        inDemo: ["Evaluations view", "scripts/run-live-evals.mjs, packages/evals"],
        resources: [R.evals, R.buildingAgents],
      },
      {
        id: "images",
        title: "Campaign image workflow",
        summary: "Generate reviewable variants, then attach one to Salesforce after confirmation.",
        body: `**FLUX.2 klein** on Workers AI generates a 1024×1024 draft from a bounded prompt, with PII and injection checks on the concept.
- Drafts are stored privately in **R2** for 7 days, with provenance (model, prompt version, content hash) in **D1**.
- The variant gallery lets you select, reject, or revise.
- **Attach to campaign** runs the confirmation flow. Apex checks the PNG's SHA-256 against the confirmed hash, creates one Salesforce file on the Campaign, and reads back its checksum and link.`,
        inDemo: ["Insights → Generate campaign visual → Attach to campaign"],
        resources: [R.flux, R.r2, R.d1],
      },
      {
        id: "campaign-context",
        title: "Campaign context: restaurant data and live weather",
        summary: "External context that makes a campaign draft specific to the moment.",
        body: `The **campaign-context** MCP server gives the orchestrator facts Salesforce doesn't have:

- \`get_restaurant_profile\`: a mocked profile for **Coastline Kitchen**, a fictional California fast-casual restaurant open 24/7, with its menu, favorites, dayparts, brand voice, and promotion rules.
- \`get_current_weather\`: live conditions from **Open-Meteo**, which is free, keyless, and CC BY 4.0, for a California city.

The push-campaign plan chains these with the knowledge graph's past performance and the Salesforce content tool, so the draft fits the menu, the time of day, the weather, and what worked before.`,
        inDemo: [
          "Quickstart: the Coastline Kitchen push campaign prompt",
          "Sources: Restaurant data, Weather · Open-Meteo",
        ],
        resources: [R.openMeteo, R.mcpIntro],
      },
    ],
  },
];

export const GLOSSARY: Array<{ term: string; definition: string }> = [
  {
    term: "Agent",
    definition:
      "A model that uses tools in a loop to accomplish a task, with a host that controls which tools it may call.",
  },
  {
    term: "Context engineering",
    definition:
      "Choosing the smallest, highest-signal context that lets the model do the next step well.",
  },
  {
    term: "Context window",
    definition:
      "Everything the model can see during one call: instructions, tool definitions, messages, and tool results.",
  },
  {
    term: "Cypher",
    definition: "Neo4j's graph query language, which matches patterns of nodes and relationships.",
  },
  {
    term: "Durable Object",
    definition:
      "A single-threaded, stateful Cloudflare instance with its own storage; one per user here.",
  },
  {
    term: "Evidence path",
    definition: "The chain of graph nodes and relationships that justifies an answer.",
  },
  {
    term: "Forced tool call",
    definition: "A step where the host requires the model to call one specific tool.",
  },
  {
    term: "GraphRAG",
    definition:
      "Retrieval-augmented generation that retrieves connected facts from a knowledge graph.",
  },
  {
    term: "HXL",
    definition:
      "Salesforce's widget format for rendering agent action output as typed, interactive cards.",
  },
  {
    term: "Idempotency key",
    definition:
      "A unique key that makes repeating a write safe: the second attempt returns the first result.",
  },
  {
    term: "Knowledge graph",
    definition: "A database of entities (nodes) and typed relationships between them.",
  },
  {
    term: "MCP",
    definition:
      "Model Context Protocol, a standard for agents to discover and call tools on servers.",
  },
  {
    term: "Policy router",
    definition:
      "Deterministic rules that answer write or forbidden requests without calling the model.",
  },
  {
    term: "Prompt injection",
    definition:
      "Instructions hidden in data that try to steer a model; treated as data here, never as commands.",
  },
  {
    term: "RAG",
    definition:
      "Retrieval-augmented generation: retrieve relevant facts into context, then generate a grounded answer.",
  },
  {
    term: "Read-back",
    definition:
      "Re-reading a record from the system of record after a write, to confirm what actually changed.",
  },
  {
    term: "Tool plan",
    definition:
      "An ordered list of tools the intent router forces, one per step, before the model writes its answer.",
  },
];
