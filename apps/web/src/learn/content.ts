/**
 * Learn page content: a primer on context and GraphRAG, then an in-depth explainer for each
 * concept the Workbench demo uses. Bodies are Markdown; every resource link was checked to resolve.
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

export const LEARN_TITLE = "Learn: context, GraphRAG, and how this demo works";
export const LEARN_LEDE =
  "A hands-on course in how an agent uses context, how GraphRAG grounds answers in connected facts, and how every piece of this workbench fits together. Each lesson has a diagram, one key idea, a way to try it here, and links to go deeper.";

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
  nagerDate: {
    label: "Nager.Date public holiday API",
    url: "https://date.nager.at/Api",
    kind: "Docs",
  },
  fedFeed: {
    label: "Federal Reserve press release feeds",
    url: "https://www.federalreserve.gov/feeds/feeds.htm",
    kind: "Docs",
  },
  finra2210: {
    label: "FINRA Rule 2210: communications with the public",
    url: "https://www.finra.org/rules-guidance/rulebooks/finra-rules/2210",
    kind: "Docs",
  },
  nwsApi: {
    label: "National Weather Service API (api.weather.gov)",
    url: "https://www.weather.gov/documentation/services-web-api",
    kind: "Docs",
  },
  mcnAgentforce: {
    label: "Agentforce in Marketing Cloud Next (Salesforce Help)",
    url: "https://help.salesforce.com/s/articleView?id=mktg.mktg_einstein_copilot_in_mc.htm&language=en_US&type=5",
    kind: "Docs",
  },
  mcnCampaignTrailhead: {
    label: "Create and customize a marketing campaign with Agentforce (Trailhead)",
    url: "https://trailhead.salesforce.com/content/learn/modules/ai-in-marketing-cloud-next/create-and-customize-a-marketing-campaign-with-agentforce",
    kind: "Course",
  },
  hostedMcpAgents: {
    label: "Expose Agentforce agents as Hosted MCP tools (Salesforce Developers)",
    url: "https://developer.salesforce.com/docs/platform/hosted-mcp-servers/guide/agentforce.html",
    kind: "Docs",
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
| **Working memory** | The current conversation, plus the workspace: the focus draft, open records, and context cards | Each user's agent Durable Object | Until **New chat** |
| **Audit trail** | What each turn did: route, tools, inputs and outputs, outcome | Agent SQLite (turn history) | 24 hours |
| **Long-term memory** | Drafts you asked to remember and confirmed Salesforce writes | Knowledge graph, linked to the campaigns and brands involved | 14 days, across chats |

**Working memory** is sent to the model as a bounded window: the last 8 messages. Earlier assistant replies are reduced to their text, so old tool results and reasoning never re-enter the prompt. The workspace is working memory too. The draft being built, the records the chat opened, and the context its tools gathered are summarized in every prompt, so the model works from structured state instead of re-reading old replies. See *The workspace* under the demo concepts.

**The audit trail** is never sent to the model. It exists for people: the History view and the audit export.

**Long-term memory** belongs in the graph because it's retrieved *by relationship* ("what did we decide about the Sample Kitchen push?"), not by recency, and it needs provenance. It's never sent automatically: the model reads it through recall tools, only when a question asks about earlier work. See *Long-term memory* under the demo concepts.`,
        inDemo: [
          "History view: Turns (the audit trail) and Memory (long-term memory)",
          "apps/edge/src/orchestrator.ts (conversationWindow)",
          "packages/knowledge-graph/src/memory.ts",
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
        summary: "Twelve read-only, curated graph tools over Neo4j, each returning evidence paths.",
        body: `- **The graph:** a deterministic, fictional dataset of about 2,400 nodes and 20,300 relationships. **Workbench** is the parent brand, with B2B accounts (each with a headquarters country), buying-role personas, campaigns, segments, content, brand rules, and consent scopes. **Sample Kitchen** is a restaurant brand under Workbench: its locations, menu, and dayparts come from the restaurant system with the same ids. Its campaigns run on the **mobile app** and **email** channels. Each of its 1,500 past push sends and 600 past email sends links to its campaign, its content (push or email), app segment, consent for that channel, location, daypart, weather, and featured menu item, so an email campaign learns from past emails and a push from past pushes. Each location's app segment holds **marketing consent per channel**: separate push, email, and SMS opt-in counts, because consent to one channel isn't consent to another. **Sample Wealth** is a wealth-management brand under Workbench: regulated content with its approval records and required disclosures, an embargoed acquisition with its release package, and institutional clients with their holdings, signals, advisors, and contacts.
- **The store:** Neo4j AuraDB, reached over the HTTPS **Query API**, because Workers can't open Bolt connections. Every tool query runs in **read access mode**, so the database itself rejects writes. The only writes are the server's fixed long-term memory statements, which keep to their own dataset.
- **The tools:** \`explain_buyer_group\`, \`find_audience_overlap\`, \`check_consent_coverage\`, \`find_similar_past_pushes\`, \`trace_content_lineage\`, \`get_graph_overview\`, three that power the sales and service use cases (\`plan_account_outreach\`, \`assess_location_impact\`, and \`map_weather_demand\`), and three for financial services (\`match_news_to_approved_content\`, \`prepare_deal_release\`, and \`build_aum_account_plan\`). Each returns an answer plus up to 25 **evidence paths**.
- **Parity:** every tool also has an in-memory implementation over the same dataset. \`pnpm kg:parity\` proves both return identical results, so local development and evals match production. It also reports tool latency; the median stays under 500 ms.
- **Grounding:** evaluations check that a graph answer names only accounts, people, campaigns, and menu items that appear in what the tools returned.
- **In a flow:** the restaurant push campaign calls \`find_similar_past_pushes\` to learn what worked before in the same weather and daypart, then passes that to the Salesforce content tool.
- **Graph explorer:** the Graph page's brand filter narrows the canvas to one brand's own nodes: a node counts as a brand's own when it's at least as close to that brand as to any other, walking loaded relationships without crossing through another brand. That's how Sample Kitchen keeps its campaigns, locations, and shared channels and consent, without pulling in Workbench's B2B accounts through the parent brand.`,
        inDemo: [
          "Use cases: Buyer-group recommendation, and Buyer-group outreach around local holidays",
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
        summary: "A stateful agent per user that runs each chat turn, on a local or hosted model.",
        body: `The **orchestrator** is a Cloudflare **Agents SDK** chat agent running in a **Durable Object**: a single-threaded, stateful instance with its own SQLite storage.
- Each user gets their own instance, keyed by a hash of their Access identity and the workspace, so conversations and history are isolated by construction.
- Each turn streams to the browser over a WebSocket, and the stream is **resumable** if the tab reconnects.
- The Durable Object runtime is the open-source **workerd**, so the same agent runs on a laptop with \`pnpm dev\` and no Cloudflare account. Which model answers, and whether D1, R2 or Workers AI are bound, is decided by the **instance profile** and the deployment target, not by the agent's code (see *The model*).

A turn runs a **tool loop** of up to 6 steps. On each step the model either calls a tool or writes the answer. Its tools come from four MCP servers, connected per turn: Salesforce, campaign context, the knowledge graph, and external services (public holidays and weather alerts). The orchestrator decides which tools are available on each step (see *Routing*) and records a **turn trace** of every event.

Around the loop, the orchestrator also handles the events the model must not: it prepares confirmed writes and, once you confirm, asks Marketing Cloud's Campaign Creation agent to save the brief or create the campaign, then reads the records back. It checks Salesforce before and after the agent call, so a retry links what an earlier attempt saved instead of saving it twice. When the model refines a saved brief's preview, the orchestrator adds the Brief ID to the request if the model left it out. While a confirmed write runs, it publishes each step as agent state, which the browser receives immediately over the WebSocket, so the progress is live rather than a spinner until the end. For an inventory check, it keeps the forecast, the graph's demand map, and the stock counts as they arrive, computes which items are low, and rebuilds the system prompt for the answer step so the model presents exactly that list. It writes **long-term memory** when a write is read back or you ask it to remember a draft, and it reopens a memory into the workspace when you choose **Reopen**. The Worker's hourly job prunes the 24-hour audit and deletes memory past its 14 days.`,
        inDemo: [
          "apps/edge/src/orchestrator.ts",
          "“Behind the scenes · technical trace” under each answer",
        ],
        resources: [R.cfAgents, R.cfChatAgents, R.durableObjects, R.aiSdk, R.react],
      },
      {
        id: "workspace",
        title: "The workspace: focus, context, and records",
        summary:
          "A per-chat, structured model of the work, built from tool results rather than model text.",
        body: `Each chat has a **working set**, shown in the Workspace panel and summarized in every prompt. It starts empty with **New chat** and has three parts:

- **Focus:** the draft being built as structured data: a title, labeled fields, a change note, and the context it was built from. A campaign's focus is the **brief** Marketing Cloud's Campaign Creation agent drafted, read field for field from the agent's reply (Key Message, Target Audience, Primary Goal, and so on). Other drafts, such as copy from the Content Builder agent, are read from the answer's labeled lines. Each revision becomes a new version, and earlier versions stay viewable. Once saved, the focus shows the brief's campaign preview and then the campaign and flow Salesforce read back.
- **Context:** cards for what tools returned, such as weather, forecasts, weather alerts, public holidays, the Federal Reserve's latest rate decision, store inventory, the inventory risk the workbench computed, the restaurant profile, graph evidence, remembered work recalled from memory, and Salesforce summaries, each with its source and fetch time.
- **Records:** records the chat opened, created, or updated, in any connected system, plus any reopened from memory, which are marked *Remembered* until the chat reads them again. Salesforce is one system and restaurant data is another; any system can join through the same reference: system, object type, and id.

Four properties make it trustworthy:

1. **Deterministic ingestion.** Cards and records come from tool results through code, never from model-written text, so nothing in the workspace is invented.
2. **Open versus available.** Records the connected systems make available are listed separately as a catalog, so the model never acts on a record the chat hasn't opened.
3. **Approvals come to you.** When something needs your approval, an **action card** appears in the chat: saving the brief in Marketing Cloud, then creating its campaign, or requesting a review after a readiness check. Accepting it prepares the confirmation card, with Salesforce's permission check.
4. **Writes act on what you see.** Saving asks the Campaign Creation agent to save exactly the focus version on screen. The confirmation records that version in its request hash, and the Brief, Campaign, and flow appear in Records as Salesforce read them back.`,
        inDemo: [
          "Workspace panel: Focus, Records, and Context",
          "apps/edge/src/working-set.ts, apps/edge/src/focus.ts",
          "Issue #46: session working set",
        ],
        resources: [R.contextEngineering, R.writingTools, R.buildingAgents],
      },
      {
        id: "model",
        title: "The model: a local gpt-oss by default, hosted by choice",
        summary: "One instance profile picks the model; the default runs on your own machine.",
        body: `The orchestrator's chat model comes from the **instance profile** (\`models.chat\`), never from code. The default is **gpt-oss:20b**, OpenAI's open-weight reasoning model, served by **Ollama** on the presenter's machine, so a demo needs no cloud account. The profile can instead point at any OpenAI-compatible endpoint, **Cloudflare Workers AI** (optionally through **AI Gateway** for logging and cost visibility), or **Amazon Bedrock**. \`apps/edge/src/models.ts\` turns the profile into an AI SDK model in one place.

- **Why gpt-oss:** after the routing and reliability fixes, the 20b size matched or beat the 120b through the pipeline at about 60% of the latency and lower cost (see *Evaluations*, measured on Workers AI).
- **Its quirks** shaped several guards. It sometimes writes a tool call into its reasoning or answer text instead of calling the tool, and leaks its internal "harmony" channel markup into tool names. The repair middleware is applied only to gpt-oss models.
- **No model reachable?** A local run falls back to scripted mode, and the fixtures answer the flows they cover. \`CHAT_ENGINE=fixture\` forces that mode for tests.
- **Images** come from the profile's image provider; the default draws a deterministic placeholder locally.`,
        inDemo: [
          "packages/contracts/src/profile.ts (InstanceProfileSchema)",
          "apps/edge/src/models.ts (resolveChatModel)",
          "Evaluations view: model comparison",
          "docs/decisions/ADR-009",
        ],
        resources: [R.gptOss20b, R.gptOssRepo, R.harmony, R.workersAi, R.aiGateway],
      },
      {
        id: "mcp",
        title: "Tools and the Model Context Protocol (MCP)",
        summary:
          "A standard way for agents to discover and call tools, and the three MCP servers here.",
        body: `**Tool calling** lets a model ask the host to run a function with structured arguments and get the result back. **MCP** standardizes this: a server advertises tools (a name, a description, and a JSON Schema for input), and clients list and call them over a transport such as streamable HTTP.

The demo uses four MCP servers:

| Server | Tools | How it's reached |
|---|---|---|
| **Salesforce Hosted MCP** | 14 governed tools backed by Agentforce agents and Apex actions | Remote, with per-user OAuth |
| **Campaign context** | Restaurant profile and store inventory (both mocked), and live weather and forecasts (Open-Meteo) | In-process; also at \`/mcp/campaign-context\` |
| **External services** | Public holidays (Nager.Date) and weather alerts (National Weather Service), both free public APIs | In-process |
| **Knowledge graph** | Nine curated Neo4j queries, plus three memory recall tools in chat | In-process; also at \`/mcp/knowledge-graph\` |

The local servers are called **in-process** through an in-memory MCP transport. The orchestrator uses the real protocol without a network hop, and external MCP clients can still reach the same servers over HTTP, behind Cloudflare Access.`,
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

- **Agent-backed tools.** Each calls an **Agentforce** agent defined as an Agent Script bundle. Under every answer, **Salesforce agents** shows which agent handled each call, its type and template, its subagent, and the actions it ran.
  - **Workbench Campaign Creation** (a Marketing Cloud Next Campaign Creation agent) drafts, saves, and refines briefs and creates campaigns and their flows. See *Marketing Cloud Next*.
  - **Workbench Content Builder** (a Marketing Cloud Next Content Builder agent) drafts copy and content sections with the standard Draft Content and Create Section actions.
  - **Workbench Account Discovery** uses Marketing's account discovery and scoring APIs for signals, engagement, and buyer groups.
  - **Campaign Readiness and Governance** is a custom agent whose Apex actions summarize a campaign and check readiness, consent, and brand rules. These stay custom on purpose: Marketing Cloud Next has no campaign-summary or readiness action, and its standard **Generate Campaign Insights** flow fails in this org until campaigns have sent and gathered engagement data.
- **Briefs and campaigns** are created only by the Campaign Creation agent's standard actions, as Marketing Cloud's own **Brief**, **BriefPlanStep**, **Campaign**, and campaign **flow** records. The workbench has no custom objects or Apex for them.
- **Other writes:** a review task, an image attachment, and an inventory case for a store manager are global **Apex invocable actions** that verify a signed confirmation.
- **Permission check:** \`check_write_access\` is a read-only Apex action the workbench calls before preparing any write. It runs as the signed-in user and reports each permission it checked.

The model never holds a write tool: only the confirmation flow can call the write tools, and every write runs as you.

Metadata (Apex, fields, the permission set, and the MCP definition) deploys through a gated CI pipeline to one approved proof org.`,
        inDemo: [
          "Use cases: Campaign performance summary, Launch readiness and review request",
          "“Salesforce agents” under each answer",
          "salesforce/force-app/main/default/aiAuthoringBundles, salesforce/force-app/main/default/classes",
          "docs/salesforce-deployment-pipeline.md",
        ],
        resources: [R.hostedMcp, R.agentforceTrailhead, R.agentforce],
      },
      {
        id: "marketing-cloud",
        title: "Marketing Cloud Next: agent-built briefs, campaigns, and flows",
        summary:
          "The workbench asks Salesforce's Campaign Creation agent to create briefs and campaigns, the way the Marketing app does.",
        body: `In **Marketing Cloud Next**, a campaign starts as a **brief** and becomes a **campaign with a flow**. Salesforce's **Campaign Creation agent** does that work with standard actions, and the workbench asks it to rather than writing records itself.

**The agent.** \`Workbench_Campaign_Creation\` is an Agent Script agent built from Salesforce's \`MktCloud__CampaignCreationAgent\` template and published as a Campaign Creation agent. Only Agent Script agents can be exposed as Hosted MCP tools, so the workbench reaches it through the \`MarketingWorkbench\` MCP server. Its **Marketing Campaigns** subagent runs the standard actions in Salesforce's required order:

| Step | Standard action | What it does |
|---|---|---|
| 1 | Draft a Campaign Brief (\`MktCloud__GenerateBrief\`) | Drafts name, description, key message, audience, goal, CTAs, KPI, guardrails, and priority. Saves nothing. |
| 2 | Save Campaign Brief (\`saveBrief\`) | Creates the **Brief** record. |
| 3 | Draft a Campaign Preview (\`MktCloud__GenerateCampaignFromBrief\`) | Plans the messages as **BriefPlanStep** records on the brief: channel, wait, subject, preheader, and body. |
| 4 | Create Campaign (\`createCampaign\`) | Creates the **Campaign**, linked to the brief. |
| 5 | Save Campaign (\`MktCloud__SaveCampaign\`) | Builds the campaign's **flow** from the preview, as a draft. |

Its **Campaign Refinement** subagent runs **Refine Campaign Preview** to change a saved preview ("make the second email shorter").

**How the workbench uses it.**
1. A campaign request (the Sample Kitchen plan, or "create a campaign in Marketing Cloud") ends with \`draft_campaign_brief\`. The agent's brief becomes the workspace focus, field for field.
2. **Save brief** (an action card, then a confirmation card): \`save_marketing_brief\` asks the agent to run steps 2 and 3.
3. **Create the campaign** (a second card): \`create_marketing_campaign\` asks it to run steps 4 and 5.
4. After each write, \`get_marketing_records\` (read-only Apex) reads the Brief, its steps, the Campaign, and the flow back from Salesforce. The workspace shows only what Salesforce returned, never the agent's say-so.

**What stays in Marketing Cloud.** The flow is created as a draft. Choosing its audience and sender, and activating it, happen in Marketing Cloud; the workbench never sends or activates anything. Previews in this org plan email (and SMS) steps: a push request is recorded in the brief's guardrails.

**Safe to retry.** Marketing Cloud's save actions aren't idempotent, so the workbench checks Salesforce before asking the agent. If this exact save was sent before and never confirmed (say, it timed out after the agent saved), and Salesforce now shows that brief, the workbench links it instead of saving again; a brief with the same name from another chat is left alone. A brief that already has its campaign never gets a second one. If the agent call fails, it checks once more, since the agent may have saved before the timeout. Only when nothing is there does it ask you to try again.

**The server fills in what the agent needs.** When you change a saved brief, the workbench adds the Brief ID to the Refine Campaign Preview request if the model left it out. The model forgot it in half of the live evaluation runs, and the agent would otherwise have to guess which brief you meant.

**Each call is one request.** Hosted MCP agent tools take a single message, so each call carries everything the agent needs: the confirmed brief fields, or the Brief ID whose preview was confirmed. The agent is asked to include the record ids in its reply, and the read-back verifies them.`,
        inDemo: [
          "Use cases: Weather-aware campaign in Marketing Cloud",
          "“Salesforce agents” under each answer, and the confirmation card's agent details",
          "Workspace focus: Brief saved, campaign preview, Campaign and flow links",
          "salesforce/force-app/main/default/aiAuthoringBundles/Workbench_Campaign_Creation",
          "apps/edge/src/marketing-writes.ts",
        ],
        resources: [R.mcnAgentforce, R.mcnCampaignTrailhead, R.hostedMcpAgents],
      },
      {
        id: "routing",
        title: "Routing: policy router, intent router, and tool plans",
        summary: "Deterministic decisions before and around the model.",
        body: `Not every decision should be left to the model. Each turn passes through two deterministic routers:

1. **Policy router.** "Remember this draft" is handled by the server, which stores the focus in long-term memory. A save or create request with a draft in the workspace prepares that write: the server plans it from the draft, Salesforce checks your permissions, and a confirmation card appears. Other save, create, or change requests get a fixed reply pointing to the confirmation flow. Publish, send, delete, and similar requests are refused. A question about what to send ("What can we send clients?") asks for guidance, not an action, and reaches the model; each sentence that names an action is judged on its own, so context before the question ("The Fed moved rates.") doesn't turn it into a request. None of these calls the model, so it can never claim a write happened.
2. **Intent router.** Clear intents force a **tool plan**: an ordered list of tools, one forced per step.
   - "Check readiness" → \`check_campaign_readiness\`
   - "Why is X in the buyer group?" → \`explain_buyer_group\`
   - "What did we decide about…?" or "last time…" → \`recall_decisions\`; "what have we worked on recently?" → \`recall_recent_work\`
   - Outreach to an account's buyer group → \`plan_account_outreach\` → \`get_public_holidays\` for the account's country
   - Weather alerts or storms near a location → \`get_weather_alerts\` → \`assess_location_impact\`
   - Inventory, stock, or ingredients at a location → \`get_weather_forecast\` → \`map_weather_demand\` → \`get_location_inventory\`
   - Fed or interest-rate news and approved content → \`get_fed_announcements\` → \`match_news_to_approved_content\` for the event it maps to; market volatility → \`match_news_to_approved_content\` alone
   - An acquisition announcement → \`prepare_deal_release\`
   - An account plan, AUM, or a Sample Wealth client's plays → \`build_aum_account_plan\`
   - A Sample Kitchen email or push campaign → profile → weather → past sends on that channel → the Campaign Creation agent's brief, which becomes the focus
   - "Create a campaign … in Salesforce" or "in Marketing Cloud" → the Campaign Creation agent's brief, then the save is prepared for confirmation
   - A change to a brief ("make it warmer") → back to the agent: a re-drafted brief before it's saved, or **Refine Campaign Preview** after
   - A change to other drafts → no tools; the model rewrites the draft, which is saved as the next version
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
- **Arguments that aren't valid JSON.** The guard escapes raw newlines inside strings and reads \`<arg_key>\`/\`<arg_value>\` markup. Arguments cut off mid-call can't be repaired, so they count as no call.
- **No usable call at all.** The step is retried once.
- **A tool call in an answer step,** which offers no tools. The call is dropped; if it was all the step produced, the answer is retried once.
- **Runaway reasoning.** Forced steps are capped at 2,048 tokens. Reasoning counts against the cap, and a detailed request to a Salesforce agent can take several hundred tokens on its own.

At the turn level:
- Structured timeouts cover the whole turn, gaps between chunks, and each tool call.
- Errors and empty answers become an explanatory message instead of a silent failure. When the Campaign Creation agent drafted a brief but the model wrote no reply, the answer is written from the brief's own fields.
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
        title: "Governance: permissions, confirmations, and kill switches",
        summary:
          "Salesforce decides who may write, a person approves every write, and operators can turn things off.",
        body: `The workbench can have Marketing Cloud's Campaign Creation agent save a brief and create its campaign and flow, and it can create a review task or attach an image. Every write follows the same flow:

1. **Plan:** the server builds the request from the draft in the workspace, so the values are exactly what you reviewed. A review task or image targets a campaign this chat opened from Salesforce, never one it only reopened from memory.
2. **Permission check:** before anything is prepared, the workbench asks Salesforce, **as you**, whether you may make this write: the workbench permission set, the Marketing User feature for campaigns, create or edit access on each object, field-level security, and edit access to the record for updates. The confirmation card lists every check. If one fails, nothing is prepared and the card says why.
3. **Confirmation:** the card shows what will be created, its values, the draft version, and, for briefs and campaigns, the Marketing Cloud agent and the standard actions it will run. It's bound by a SHA-256 request hash and a 5-minute expiry, and it can be used once.
4. **Execute:**
   - For a **brief or campaign**, the workbench asks the Campaign Creation agent, through its Hosted MCP tool, to run its standard actions. The agent runs as you, so Salesforce enforces your permissions as each action runs.
   - For a **review task, image, or inventory case**, the Worker signs the confirmation with HMAC. Apex verifies the signature, the expiry, the same user, and the hash, then writes in **user mode**. An inventory case's contents come from the Worker, so its request hash is the SHA-256 of exactly those contents, and Apex re-hashes what it receives before writing.
5. **Read-back:** the workbench reads the records back from Salesforce (\`get_marketing_records\` for Marketing Cloud) and shows only what Salesforce returned. If the agent says it saved something that Salesforce doesn't show, nothing is shown as saved.

You watch both halves step by step. While a confirmation is prepared, the steps are the plan, Salesforce's permission check with how many checks passed, and binding the request to a one-time confirmation. While a confirmed write runs, they're the confirmation check, a look for an earlier attempt or the signing, the call to the agent or the Apex action, the read-back, and the memory record. A failure marks the step where it stopped and says why.

**Who checks what.** Each layer does one job:

| Layer | Responsible for | Not responsible for |
|---|---|---|
| **The model** | Drafting and proposing saves | Writing anything: it has no write tools |
| **The workbench** | Planning the request from your draft, asking Salesforce for a permission check, hashing, reading back | Deciding who may write, or creating briefs and campaigns itself |
| **The Marketing Cloud agent** | Running Marketing Cloud's standard actions for briefs, previews, campaigns, and flows | Deciding what to save: it saves what you confirmed |
| **You** | Reviewing exact values and confirming | — |
| **Salesforce** | Authorization (profile, permission sets, field-level security, sharing), signature checks for Apex writes, the records, and read-back | — |

**Kill switches** (\`WRITES_ENABLED\`, \`DISABLED_TOOLS\`, \`MEMORY_ENABLED\`) are Worker secrets that operators can flip without a deploy. Graph tools read in read-only mode; only the server's fixed memory statements write, and only to the memory dataset. The external-services tools only read public data (holidays, weather alerts, and Federal Reserve press releases) and send nothing about customers. No customer PII enters prompts, logs, or the graph.`,
        inDemo: [
          "Draft something → the Save to Salesforce action card in the chat → confirmation card with the permission check",
          "Check readiness → the Request a review action card → confirmation card",
          "Attach to campaign on a generated image",
          "templates/cloudflare/README.md (operator runbook)",
        ],
        resources: [R.owaspLlm, R.buildingAgents],
      },
      {
        id: "ui",
        title: "Structured UI: Markdown, HXL cards, and native fallbacks",
        summary: "Answers render as rich text, and records render as governed cards.",
        body: `- **Markdown answers.** The model may use concise Markdown. The UI renders it with \`react-markdown\`, which never renders raw HTML, so model output can't inject markup.
- **HXL cards.** Salesforce's HXL widgets (MCP Apps) let an agent action return a typed, interactive card, such as campaign readiness. When a host can't render HXL, the workbench shows an equivalent accessible **native fallback** built from the same contract.
- **Salesforce agents panel.** Under each answer that called Salesforce, a panel lists each call's agent, its type and template, the subagent, and the actions (with their flow or Apex targets) behind it. The confirmation card shows the same for the write it prepares.
- **Graph evidence panel.** Knowledge-graph paths render as directional chains, each with a text alternative for screen readers.
- **Live write progress.** Accepting an action card switches its button to **Preparing…** and shows the preparation's steps until the confirmation card appears. Clicking **Confirm** disables the buttons and shows the write's steps in the card as the Worker reports them, kept in view while they run. Afterwards a collapsible **Behind the scenes** record keeps each step and how long it took; it opens by itself when a write fails.
- **Inventory case confirmation.** The card lists the store manager, the forecast, and a table of each low item: on hand, needed, and the dishes it goes into. After you confirm, a banner links to the Case.
- **Use-case library.** A page of every scenario the demo runs, filterable by team, with its prompts, systems, and data flow. **Try it** puts a prompt in the chat box without sending it.
- **Accessibility.** The UI targets WCAG 2.2 AA and is tested in Chrome and Edge.`,
        inDemo: [
          "Workspace panel (readiness card with native fallback)",
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
  - tool input and output, with the Salesforce agent, subagent, and actions behind each Salesforce tool; errors; recovery messages; and the outcome, including when the answer was written from a tool's result because the model wrote none
  - the closing line gives the turn's total time with its **tokens** (input plus output, summed over the steps) and **tool calls**
- **Workers Logs** for operators: a Salesforce or agent call that failed is logged with its error and stack, even when the user sees a friendly message. A write or confirmation that failed logs the step where it stopped. Request content is never logged.
- **Turn history** (History → Turns): each utterance with the orchestrator's interpretation, the tool calls with inputs and results, and the outcome. Each row shows the turn's seconds beside its tokens and tool calls. Filterable, and kept 24 hours per user.
- **Memory** (History → Memory): what the workspace remembers across chats, with provenance, and **Reopen** and **Forget** buttons. The audit export lists each reopen. See *Long-term memory*.
- **Audit export:** a JSON download of the user's confirmed writes, memory remembers and forgets, and turn summaries.`,
        inDemo: [
          "Any answer → “Behind the scenes · technical trace”",
          "History view → Export audit (JSON)",
          "History view → Memory",
        ],
        resources: [R.aiGateway, R.contextEngineering],
      },
      {
        id: "evaluations",
        title: "Evaluations",
        summary: "Measure the whole pipeline across models, and publish the real results.",
        body: `\`pnpm eval:live\` runs the **production pipeline**: policy router, intent router, prompt, guards, and step settings, against live Workers AI models. Three suites:

- **Demo scenarios:** the use-case library's prompts, through the full pipeline.
- **Routing through the pipeline:** 28 prompts, including memory recall and the financial services use cases, as evaluators experience them.
- **Routing by the model alone:** the same prompts with no routers, isolating model quality.

Each turn is scored on:
- **right tool** (or the right plan in order)
- **answered**
- **no tool errors**
- **no false write claims**
- **graph-grounded:** a graph or memory answer names only accounts, clients, people, campaigns, content, menu items, and compliance approval IDs that its tools returned
- **agent request grounded:** a request to the Marketing Cloud Campaign Creation agent carries what the turn gathered. A brief request names the brand, a menu item, and the city or weather; a preview refinement names the saved Brief ID. It's scored on the request the agent actually receives.

Latency and tokens are recorded too, and the Evaluations view shows each turn's seconds with its tokens and tool calls, plus the mean tokens and tool calls per turn for each model. Runs recorded before the grounding check show no rate for it.

**What good looks like.** Pass/fail says the pipeline behaved; it doesn't say the answer was *good*. Each demo scenario has a written **rubric** in \`packages/evals/src/rubric.ts\`: a goal, an audience persona where a customer is involved, deterministic **criteria** (for the weather-aware Sample Kitchen campaign: names a menu item, uses the real weather and time of day, cites what worked before, a key message of 160 characters or fewer, a measurable KPI), and weights saying which quality dimensions matter. Criteria are reported as "criteria met" beside the pass gate, so pass rates stay comparable with earlier runs.

**Quantifying the qualitative.** A panel of two strong models from different families (GLM-5.3 and DeepSeek V4 Pro; a model never judges its own family) rates each answer 1 to 5 on anchored scales: context fidelity, accuracy, clarity, brand voice, engagement, marketer usefulness, and **would act**. For "would act" the judge answers as the audience persona on a standard purchase-intent scale, and the report shows the share of ratings that are 4 or 5 (the top-2-box). Ratings combine into a 0 to 100 **Quality Index** with a 95% bootstrap interval, and the report shows how often the two judges agree. Before a run is published, \`pnpm eval:calibrate\` has each judge score hand-written strong, mediocre, and weak answers and requires the right ordering. These are judge scores, not customer behavior: use them to rank models, not to forecast click rates.

**A fixed stand-in for the Marketing Cloud agent.** The real agent's copy doesn't depend on the orchestrator model, so every contestant would get the same canned text. In the run, one fixed reference model plays the agent, so what differs is what the orchestrator asked for (weather, time, menu, past results) and how it presents the result.

**Cost.** Every turn, judge call, and simulated-agent call is priced from Cloudflare's published Workers AI per-million-token rates (neurons are derived at $0.011 per 1,000). The run prints a projection first and refuses to start above \`--max-usd\`; the report shows cost per turn, cost per passing turn, and a cost-versus-quality chart. The expensive frontier models are opt-in with \`--tier frontier\`. Cloudflare limits paid frontier models to 20 requests a minute per model, so the runner throttles every call (turns, judges, simulator) per model, serves contestant turns before judge calls, and refreshes its sign-in token during long runs.

\`pnpm eval\` runs the routing set through the production policy and intent routers without a model, on every verify. Read-style Salesforce tools are fixtures in the live run, so the scores measure orchestration, not Salesforce agent quality. A held-out set of paraphrases guards the router against overfitting. The first published run found a real routing bug: any prompt mentioning "campaign" forced the summary tool.`,
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
        inDemo: ["Workspace → Generate campaign visual (expand it) → Attach to campaign"],
        resources: [R.flux, R.r2, R.d1],
      },
      {
        id: "campaign-context",
        title: "Campaign context: restaurant data and live weather",
        summary: "External context that makes a campaign draft specific to the moment.",
        body: `The **campaign-context** MCP server gives the orchestrator facts Salesforce doesn't have:

- \`get_restaurant_profile\`: the restaurant system's own data for **Sample Kitchen**, a fictional fast-casual brand under Workbench that is open 24/7: its five California locations, menu, favorites, dayparts, app audience with opt-ins **by channel** (push, email, SMS), brand voice, and promotion rules. Locations and menu items carry the same ids as their knowledge-graph nodes.
- \`get_current_weather\`: live conditions from **Open-Meteo**, which is free, keyless, and CC BY 4.0, for a California city.
- \`get_weather_forecast\`: Open-Meteo's daily forecast, with each day's demand-planning weather (heat, rain, fog, cloudy, or clear).
- \`get_location_inventory\`: a restaurant's stock from a randomized **store inventory** mock, with par levels and typical daily use from the menu's recipes. See *The use-case library*.

The Sample Kitchen campaign plan (email or push) chains these with the knowledge graph's past performance and the Salesforce content tool. The plan is **channel-aware**: the channel you ask for (or the draft's channel) is pinned on the past-performance lookup by the server, so an email campaign cites email opt-ins, never push opt-ins, whatever the model passed. The finished draft is saved to the workspace **focus**. The draft fits the menu, the time of day, the weather, and what worked before, and "make it warmer" revises it as a new version.`,
        inDemo: [
          "Use cases: Weather-aware campaign in Marketing Cloud (the push prompt)",
          "Sources: Restaurant data, Weather · Open-Meteo",
        ],
        resources: [R.openMeteo, R.mcpIntro],
      },
      {
        id: "use-cases",
        title: "The use-case library: marketing, sales, service, and financial services",
        summary:
          "Every scenario the demo runs, how data flows through it, the ones that reach beyond marketing, and three for a regulated industry.",
        body: `**Use cases** (in the left rail) lists every scenario the demo can run end to end. Each has the situation it's for, the prompts that drive it (with a **Try it** button), the systems involved, a step-by-step data flow, what the knowledge graph contributes, what it writes, and what to watch for. Drafted scenarios that aren't built yet are shown greyed out as *Coming soon*.

Two use cases take the same pattern beyond marketing. Each pairs a new free public API with the knowledge graph, and **the graph supplies the key element**.

**Sales: buyer-group outreach around local holidays.** "Plan outreach to Acme Outfitters' buyer group for the next month."
1. \`plan_account_outreach\` walks the graph from the account to its buying-role personas. For each person it returns their engagement, when they last engaged, and **the channels they have marketing consent for**, following Persona → HAS_CONSENT → ConsentScope → FOR → Channel. It also returns the account's headquarters country.
2. \`get_public_holidays\` asks **Nager.Date** for that country's upcoming public holidays.
3. The answer is a prioritized, dated plan that uses only consented channels and avoids the holidays. Nothing is sent or logged.

**Service: severe-weather customer impact.** "There are weather alerts near our San Diego location. Which customers are affected and what should we tell them?"
1. \`get_weather_alerts\` asks the **National Weather Service** for active watches, warnings, and advisories at the restaurant's coordinates. If there are none there, it lists alerts elsewhere in California.
2. \`assess_location_impact\` walks Location ← Segment → consent and Campaign → TARGETS → Segment. It returns how many app users are near the location, how many can be reached on each channel (push, email, SMS) under that channel's own consent, and which active campaigns target them and should be paused. The counts are aggregate; no individual customer is named.
3. The answer is an impact summary, a drafted customer notice, and a note for the store team. Nothing is sent or paused.

Both APIs are free and keyless, called live from the Worker through a new in-process **external services** MCP server. An API failure comes back as a tool error, and the answer says so instead of guessing.

**Service: weather-driven inventory check, with a case for the store manager.** "Check inventory for our Sacramento store against the forecast."
1. \`get_weather_forecast\` reads the daily **Open-Meteo** forecast and buckets each day for demand planning: **heat** for highs of 88°F or more, **rain** for wet days, otherwise fog, cloudy, or clear.
2. \`map_weather_demand\` walks WeatherCondition → **LIFTS_DEMAND** → MenuItem → **MADE_WITH** → InventoryItem, plus Location → **MANAGED_BY** → StoreManager. Each lift is learned from past push results: a dish's average order rate under that weather against its overall average, kept when it's at least 15% higher. Heat lifts the cold drinks and açaí bowl; rain and fog lift soup, noodles, and the burrito.
3. \`get_location_inventory\` reads the restaurant's stock from the **store inventory system**. In this demo it's a randomized mock that's stable within a day: on hand, par level, and typical daily use per item.
4. **Code, not the model, decides what's low.** For each weather-lifted item, the forecast need is typical daily use on each day, raised by the lift on the days whose weather lifts a dish made with it. An item is low when what's on hand won't cover that. The result becomes an **Inventory risk** card and an **action card**, and the answer step is told exactly this list.
5. Accepting the card prepares a **Salesforce case** for the store manager. The case contents are hashed, the hash becomes the confirmation's request hash, and after you confirm, the \`create_inventory_case\` Apex action re-hashes what it received and refuses anything that doesn't match. It then finds the manager's Contact by title and restaurant, creates the Case as you, and reads it back.

The graph and prompts carry the manager's name only, never contact details. Nothing is ordered.

**Financial services: Sample Wealth.** Three use cases (filter **Financial services**) show the graph in a regulated industry, where only content a registered principal approved can go out, exactly as approved, with its required disclosures. Sample Wealth is a fictional wealth-management brand under Workbench.
- **Market news to pre-approved content.** "The Fed just announced its rate decision. What pre-approved content can we send clients today?"
  1. \`get_fed_announcements\` reads the Federal Reserve's public press feed, finds the latest FOMC statement, and reads its rate decision: raise, lower, or maintain, the size, and the new target range. It maps the decision to a market event.
  2. \`match_news_to_approved_content\` walks MarketEvent ← **RESPONDS_TO** ← ContentAsset → **APPROVED_UNDER** → Approval and → **REQUIRES** → Disclosure. It returns what's ready to send, with approval IDs, expiry, and disclosures; what's blocked and exactly why (an expired approval, one still pending, or a **FAILED** compliance rule); reach per channel under marketing consent; and past responses, which show that sending within hours of the news opened far better than the next day.
  3. The answer never writes new regulated copy. Asking for a Marketing Cloud campaign hands the approved asset, its approval ID, and disclosures to the Campaign Creation agent's brief.
- **Acquisition announcement, released on time.** \`prepare_deal_release\` orders the embargoed package through **RELEASED_WITH** → Deal and checks each piece's audience through **ADDRESSED_TO** → Segment → **HAS_CONSENT**. Advisors get their FAQ first, then the press release, then client letters. The acquired firm's clients get service notices under their client agreement, never marketing, until they opt in, so an SMS that also failed its disclosure check is blocked for both reasons.
- **Account plan to grow assets under management.** \`build_aum_account_plan\` walks Client → **HAS_SIGNAL** → Signal → **SUGGESTS** → Product for products the client doesn't hold, sizes each play from the estimated assets held elsewhere, counts how many clients of the same type hold it, and finds its approved content through Product ← **EXPLAINS** ← ContentAsset. Each contact comes with the channel that has approved content they consented to, so the 30/60/90-day sequence never sends content on a channel it isn't approved for. "Activate the plan" drafts a Marketing Cloud brief from it.`,
        inDemo: [
          "Use cases in the left rail",
          "Sources: Holidays · Nager.Date, Weather alerts · NWS, Rate news · Federal Reserve",
          "Workspace: Forecast, Store inventory, and Inventory risk cards, then the case action card",
          "apps/edge/src/external-services, apps/edge/src/inventory-risk.ts, apps/web/src/usecases",
        ],
        resources: [R.nagerDate, R.nwsApi, R.openMeteo, R.fedFeed, R.finra2210, R.mcpIntro],
      },
      {
        id: "long-term-memory",
        title: "Long-term memory: remembering across chats",
        summary:
          "Drafts and decisions stored in the graph by the server, recalled by tools, and forgotten on request.",
        body: `A new chat starts with an empty workspace, but some work should outlive it: the draft you settled on, the campaign you saved, the review you asked for. **Long-term memory** keeps these in the knowledge graph for 14 days, shared by the workspace.

**What gets remembered, and by whom.** The model never writes memory. The server does, only on events it has verified:
- a Salesforce save, review task, or image attachment that you confirmed and Salesforce read back
- a request to remember the draft in focus: say "remember this draft", or use **History → Memory**

**How it's stored.** Each memory is a small subgraph in its own dataset, next to the demo graph:
- a \`Draft\` node per version, linked to the version it replaced (\`SUPERSEDES\`)
- a \`Decision\` node, linked to the draft it saved (\`DECIDED_ON\`) and the Salesforce record it created (\`RECORDED_IN\`)
- \`ABOUT\` links to the \`Campaign\` and \`Brand\` nodes involved, so "what did we decide about Sample Kitchen?" is a graph question

Every node carries its workspace and an expiry. The person who acted is stored only as a hash.

**How it's recalled.** When you ask about earlier work ("what did we decide…", "last time…", "what have we worked on recently?"), the intent router forces a recall tool:
- \`recall_decisions\`
- \`recall_recent_work\`
- \`explain_memory\`

The server gives these tools the workspace, so the model can't read another workspace's memory. Each item comes back **dated and sourced**, with provenance paths, and the model is told to treat it as past work and re-check Salesforce before reusing it.

**How it's reopened.** **Reopen** in the Memory tab puts remembered work back into the current chat:
- A remembered draft becomes the focus again, at its remembered version, with a note saying where it came from.
- For a decision, its draft becomes the focus.
- The records it links to join **Records**, marked *Remembered*.

Memory may be stale, so reopening never marks a draft as saved, and a remembered campaign isn't a write target. The chat has to read it from Salesforce again first. Only you can reopen memory; the model can't.

**How it's forgotten.** **Forget** in the Memory tab deletes an item at once, and the audit export records it. An hourly job deletes anything past 14 days. \`MEMORY_ENABLED=false\` turns memory off entirely.`,
        inDemo: [
          "Chat: “Remember this draft”, then New chat and “What did we decide about …?”",
          "History → Memory (Reopen, Forget, Remember current draft)",
          "packages/knowledge-graph/src/memory.ts, apps/edge/src/memory.ts",
          "docs/decisions/ADR-007-long-term-graph-memory.md",
        ],
        resources: [R.contextEngineering, R.graphDb, R.cypher],
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
    term: "Long-term memory",
    definition:
      "Drafts and decisions the server stores in the graph for 14 days, recalled by tools across chats, never written by the model.",
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
