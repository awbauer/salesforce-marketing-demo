/**
 * The learning layer over content.ts: what each part teaches, a diagram and one key idea per
 * section, hands-on "try it" actions, and a quick check per part. Kept separate so the long-form
 * text stays easy to edit.
 */

export type DiagramId =
  | "context-window"
  | "memory-layers"
  | "context-defenses"
  | "rag-flow"
  | "graph-path"
  | "graph-tools"
  | "architecture"
  | "model-guards"
  | "mcp"
  | "salesforce"
  | "routing"
  | "reliability"
  | "governance"
  | "ui-layers"
  | "observability"
  | "evaluations"
  | "images"
  | "push-plan";

export type TryIt =
  | { kind: "prompt"; label: string; prompt: string }
  | { kind: "view"; label: string; view: "graph" | "history" | "evaluations" };

export type SectionLesson = { diagram: DiagramId; keyIdea: string; tryIt?: TryIt[] };

export type PartLesson = {
  number: number;
  tagline: string;
  minutes: number;
  outcomes: string[];
  check: { question: string; options: string[]; answer: number; explain: string };
};

export const PART_LESSONS: Record<string, PartLesson> = {
  context: {
    number: 1,
    tagline: "What the model can see, and why it matters",
    minutes: 6,
    outcomes: [
      "Name what fills a model's context window on every call",
      "Tell working memory, the audit trail, and long-term memory apart",
      "Spot the context failures the demo defends against",
    ],
    check: {
      question:
        "A user says “looks good, create it”. Where does the orchestrator find what “it” means?",
      options: [
        "In the model's memory from the previous call",
        "In the conversation window sent with this turn",
        "In the turn history (audit trail)",
        "In the knowledge graph",
      ],
      answer: 1,
      explain:
        "Models keep nothing between calls. The last 8 messages are sent with every turn, so the previous draft is in the context window. The audit trail is only for people, and graph memory is still planned (issue #41).",
    },
  },
  graphrag: {
    number: 2,
    tagline: "Grounding answers in connected facts",
    minutes: 7,
    outcomes: [
      "Explain retrieve → augment → generate",
      "Say when a graph beats similarity search",
      "Describe how the demo's six graph tools return evidence paths",
    ],
    check: {
      question: "Which question needs GraphRAG rather than plain vector RAG?",
      options: [
        "“Find the paragraph in the brief about the offer.”",
        "“Which accounts engaged with two campaigns and lack SMS consent?”",
        "“Summarize this email draft.”",
        "“Translate the headline into Spanish.”",
      ],
      answer: 1,
      explain:
        "It joins facts across accounts, campaigns, engagement, and consent: a multi-hop question. Similarity search finds similar text but can't follow relationships.",
    },
  },
  concepts: {
    number: 3,
    tagline: "Every moving part of the workbench",
    minutes: 18,
    outcomes: [
      "Trace one chat turn from the browser to Salesforce and back",
      "Explain why routing and guards sit around the model",
      "Know where to look when something goes wrong",
    ],
    check: {
      question: "The user asks the orchestrator to “publish the campaign”. What happens?",
      options: [
        "The model calls a publish tool after the user confirms",
        "The policy router refuses without calling the model",
        "The intent router forces the summary tool",
        "Salesforce rejects it after the model tries",
      ],
      answer: 1,
      explain:
        "Publishing is blocked outright. The policy router answers deterministically before the model runs, so no tool is called and nothing can falsely claim success.",
    },
  },
};

const BUYER_GROUP_PROMPT = "Who should be in the buyer group for Acme Outfitters, and why?";
const PUSH_PROMPT =
  "Draft a push notification campaign for Coastline Kitchen, our fast casual restaurant in California, tailored to the current weather, time of day, and our menu";

export const SECTION_LESSONS: Record<string, SectionLesson> = {
  "what-is-context": {
    diagram: "context-window",
    keyIdea:
      "The model sees only what's in this call's window. Good context is the smallest set of high-signal facts for the next step.",
    tryIt: [
      {
        kind: "prompt",
        label: "Ask a question, then open its technical trace",
        prompt: "Summarize the sample campaign and its recent performance",
      },
    ],
  },
  "memory-layers": {
    diagram: "memory-layers",
    keyIdea:
      "“Session context” is three things: working memory for the model, an audit trail for people, and long-term memory by relationship.",
    tryIt: [{ kind: "view", label: "Open turn history", view: "history" }],
  },
  "context-risks": {
    diagram: "context-defenses",
    keyIdea:
      "Treat earlier replies and tool results as data, not instructions, and never let the model hold write tools.",
    tryIt: [
      { kind: "prompt", label: "Try a blocked request", prompt: "Publish and send the campaign" },
    ],
  },
  rag: {
    diagram: "rag-flow",
    keyIdea:
      "RAG adds retrieved facts to the context so answers come from your data, not training.",
  },
  "graphrag-explained": {
    diagram: "graph-path",
    keyIdea:
      "GraphRAG follows relationships, so an answer can join many facts and show the path that proves it.",
    tryIt: [{ kind: "view", label: "Explore the graph", view: "graph" }],
  },
  "graphrag-here": {
    diagram: "graph-tools",
    keyIdea:
      "Six curated, read-only queries, each returning evidence paths, with a local copy that must match Neo4j exactly.",
    tryIt: [
      { kind: "prompt", label: "Ask a graph question", prompt: BUYER_GROUP_PROMPT },
      { kind: "view", label: "Open the graph explorer", view: "graph" },
    ],
  },
  orchestrator: {
    diagram: "architecture",
    keyIdea:
      "One stateful agent per user runs each turn as a short tool loop and records every event.",
  },
  model: {
    diagram: "model-guards",
    keyIdea:
      "The model was chosen by measuring the whole pipeline, and its known quirks shaped the guards.",
    tryIt: [{ kind: "view", label: "See the model comparison", view: "evaluations" }],
  },
  mcp: {
    diagram: "mcp",
    keyIdea:
      "MCP lets any agent list and call tools the same way, whether the server is remote or in-process.",
  },
  salesforce: {
    diagram: "salesforce",
    keyIdea:
      "Salesforce is the system of record: agents answer through tools, and writes are Apex actions the model can't call.",
    tryIt: [
      {
        kind: "prompt",
        label: "Check campaign readiness",
        prompt: "Check the sample campaign readiness and explain every blocker",
      },
    ],
  },
  routing: {
    diagram: "routing",
    keyIdea:
      "Deterministic routers decide what must never be left to chance; the model handles the rest.",
    tryIt: [{ kind: "view", label: "See each turn's interpretation", view: "history" }],
  },
  reliability: {
    diagram: "reliability",
    keyIdea:
      "Small models fail at tool calls in predictable ways, so each failure mode gets a specific guard.",
  },
  governance: {
    diagram: "governance",
    keyIdea:
      "Every write is previewed, confirmed by a person, signed, verified by Salesforce, and read back.",
  },
  ui: {
    diagram: "ui-layers",
    keyIdea:
      "Model text renders as safe Markdown; records render as typed cards with accessible fallbacks.",
  },
  observability: {
    diagram: "observability",
    keyIdea: "Every turn leaves a trace for engineers and a history for reviewers.",
    tryIt: [{ kind: "view", label: "Open turn history", view: "history" }],
  },
  evaluations: {
    diagram: "evaluations",
    keyIdea:
      "Evaluate the real pipeline, not just the model, and keep held-out prompts to catch overfitting.",
    tryIt: [{ kind: "view", label: "Open evaluations", view: "evaluations" }],
  },
  images: {
    diagram: "images",
    keyIdea:
      "Generated images stay private drafts until a person confirms, and Salesforce verifies the file's hash.",
  },
  "campaign-context": {
    diagram: "push-plan",
    keyIdea:
      "Outside context (menu, weather, past results) turns a generic draft into one that fits this moment.",
    tryIt: [{ kind: "prompt", label: "Draft the Coastline Kitchen push", prompt: PUSH_PROMPT }],
  },
};
