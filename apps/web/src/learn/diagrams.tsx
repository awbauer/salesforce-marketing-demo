import type { ReactNode } from "react";
import { labelColor } from "../graph/graph-model";
import type { DiagramId } from "./lessons";

/**
 * Learn-page diagrams. Most are built from a few accessible primitives (flows, lanes, cards)
 * whose markup is ordered lists, so a screen reader hears the same sequence the picture shows.
 */

type Tone =
  | "user"
  | "edge"
  | "model"
  | "tool"
  | "store"
  | "guard"
  | "output"
  | "blocked"
  | "person";
type Step = { title: string; caption?: string; tone: Tone; glyph?: string };

function Figure({
  label,
  caption,
  children,
}: {
  label: string;
  caption: string;
  children: ReactNode;
}) {
  return (
    <figure className="diagram" aria-label={label}>
      {children}
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

function StepBox({ step }: { step: Step }) {
  return (
    <span className={`diagram-box tone-${step.tone}`}>
      {step.glyph && (
        <span className="diagram-glyph" aria-hidden="true">
          {step.glyph}
        </span>
      )}
      <span className="diagram-box-text">
        <strong>{step.title}</strong>
        {step.caption && <small>{step.caption}</small>}
      </span>
    </span>
  );
}

function Flow({ steps, numbered = false }: { steps: Step[]; numbered?: boolean }) {
  return (
    <ol className={`diagram-flow ${numbered ? "is-numbered" : ""}`}>
      {steps.map((step, index) => (
        <li key={step.title} className="diagram-step">
          {numbered && (
            <span className="diagram-number" aria-hidden="true">
              {index + 1}
            </span>
          )}
          <StepBox step={step} />
        </li>
      ))}
    </ol>
  );
}

function Lanes({ lanes }: { lanes: Array<{ label: string; steps: Step[] }> }) {
  return (
    <ul className="diagram-lanes">
      {lanes.map((lane) => (
        <li key={lane.label} className="diagram-lane">
          <span className="diagram-lane-label">{lane.label}</span>
          <Flow steps={lane.steps} />
        </li>
      ))}
    </ul>
  );
}

function Cards({ cards }: { cards: Array<Step & { points?: string[] }> }) {
  return (
    <ul className="diagram-cards">
      {cards.map((card) => (
        <li key={card.title} className={`diagram-card tone-${card.tone}`}>
          <p className="diagram-card-title">
            {card.glyph && (
              <span className="diagram-glyph" aria-hidden="true">
                {card.glyph}
              </span>
            )}
            <strong>{card.title}</strong>
          </p>
          {card.caption && <p className="diagram-card-caption">{card.caption}</p>}
          {card.points && (
            <ul>
              {card.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

function ContextWindow() {
  const segments = [
    { name: "System rules", detail: "authority, safety, format", share: 14, tone: "guard" },
    { name: "Tool definitions", detail: "names, descriptions, schemas", share: 30, tone: "tool" },
    { name: "Conversation", detail: "last 8 messages, text only", share: 28, tone: "user" },
    { name: "Tool results", detail: "this turn only", share: 20, tone: "store" },
    { name: "Latest message", detail: "what to do now", share: 8, tone: "person" },
  ] as const;
  return (
    <Figure
      label="What fills the context window"
      caption="One model call. Proportions are illustrative; the window is rebuilt from scratch every call."
    >
      <div className="context-window">
        <p className="context-window-label">
          <span>Context window</span>
          <span>everything the model can see</span>
        </p>
        <ol className="context-bar">
          {segments.map((segment) => (
            <li
              key={segment.name}
              className={`context-segment tone-${segment.tone}`}
              style={{ flexGrow: segment.share }}
            >
              <strong>{segment.name}</strong>
              <small>{segment.detail}</small>
            </li>
          ))}
        </ol>
        <Flow
          steps={[
            { title: "gpt-oss-20b", caption: "reads the whole window", tone: "model", glyph: "◆" },
            { title: "Next step", caption: "call a tool, or answer", tone: "output", glyph: "→" },
          ]}
        />
      </div>
    </Figure>
  );
}

function MemoryLayers() {
  const layers = [
    {
      name: "Working memory",
      where: "Agent Durable Object · chat messages",
      reader: "Read by the model",
      life: "Until New chat",
      width: 22,
      tone: "user",
    },
    {
      name: "Audit trail",
      where: "Agent SQLite · turn history",
      reader: "Read by people",
      life: "14 days",
      width: 58,
      tone: "store",
    },
    {
      name: "Long-term memory",
      where: "Knowledge graph · linked to entities",
      reader: "Read by the model, through tools",
      life: "Across chats (planned, #41)",
      width: 100,
      tone: "tool",
      planned: true,
    },
  ] as const;
  return (
    <Figure
      label="Three layers of memory"
      caption="Each layer has a different reader and lifetime. Only working memory is sent to the model every turn."
    >
      <ol className="memory-layers">
        {layers.map((layer) => (
          <li key={layer.name} className={`memory-layer tone-${layer.tone}`}>
            <div>
              <strong>{layer.name}</strong>
              <small>{layer.where}</small>
            </div>
            <span className="memory-reader">{layer.reader}</span>
            <span className="memory-life">
              <span
                className={`memory-bar ${"planned" in layer ? "is-planned" : ""}`}
                style={{ width: `${layer.width}%` }}
                aria-hidden="true"
              />
              <span>{layer.life}</span>
            </span>
          </li>
        ))}
      </ol>
    </Figure>
  );
}

function GraphPath() {
  const nodes = [
    { id: "campaign", label: "Campaign", name: "Fall Loyalty", x: 70, y: 60 },
    { id: "segment", label: "Segment", name: "Fall audience", x: 230, y: 60 },
    { id: "persona", label: "Persona", name: "Economic buyer", x: 390, y: 60 },
    { id: "account", label: "Account", name: "Acme Outfitters", x: 550, y: 60 },
    { id: "consent", label: "ConsentScope", name: "Email marketing", x: 540, y: 180 },
    { id: "asset", label: "ContentAsset", name: "Hero email", x: 240, y: 180 },
  ];
  const edges = [
    { from: "campaign", to: "segment", type: "TARGETS", path: true },
    { from: "segment", to: "persona", type: "INCLUDES", path: true },
    { from: "persona", to: "account", type: "WORKS_AT", path: true },
    { from: "persona", to: "consent", type: "HAS_CONSENT", path: false },
    { from: "persona", to: "asset", type: "ENGAGED_WITH", path: false },
  ];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return (
    <Figure
      label="An evidence path in the knowledge graph"
      caption="Answering “why is Acme in the fall audience?” means following relationships. The highlighted path is the evidence."
    >
      <svg
        className="graph-path-svg"
        viewBox="0 0 620 240"
        role="img"
        aria-labelledby="gp-title gp-desc"
      >
        <title id="gp-title">Evidence path</title>
        <desc id="gp-desc">
          Fall Loyalty campaign targets the fall audience segment, which includes the economic buyer
          persona, who works at Acme Outfitters. The persona also has email marketing consent and
          engaged with the hero email.
        </desc>
        <defs>
          <marker
            id="gp-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className="gp-arrowhead" />
          </marker>
        </defs>
        {edges.map((edge) => {
          const from = byId.get(edge.from);
          const to = byId.get(edge.to);
          if (!from || !to) return null;
          const dx = to.x - from.x;
          const dy = to.y - from.y;
          const length = Math.hypot(dx, dy);
          const pad = 26;
          const x1 = from.x + (dx / length) * pad;
          const y1 = from.y + (dy / length) * pad;
          const x2 = to.x - (dx / length) * pad;
          const y2 = to.y - (dy / length) * pad;
          return (
            <g
              key={`${edge.from}-${edge.to}`}
              className={edge.path ? "gp-edge is-path" : "gp-edge"}
            >
              <line x1={x1} y1={y1} x2={x2} y2={y2} markerEnd="url(#gp-arrow)" />
              <text
                x={x1 + (x2 - x1) * (edge.path ? 0.5 : 0.62)}
                y={y1 + (y2 - y1) * (edge.path ? 0.5 : 0.62) - 7}
                textAnchor="middle"
              >
                {edge.type}
              </text>
            </g>
          );
        })}
        {nodes.map((node) => (
          <g key={node.id} className="gp-node">
            <circle cx={node.x} cy={node.y} r="20" fill={labelColor(node.label)} />
            <text x={node.x} y={node.y + 36} textAnchor="middle" className="gp-name">
              {node.name}
            </text>
            <text x={node.x} y={node.y + 50} textAnchor="middle" className="gp-label">
              {node.label}
            </text>
          </g>
        ))}
      </svg>
    </Figure>
  );
}

function GraphTools() {
  const tools = [
    ["explain_buyer_group", "Why is this member in the group?"],
    ["find_audience_overlap", "Who is also targeted elsewhere?"],
    ["check_consent_coverage", "Who lacks consent for a channel?"],
    ["find_similar_past_pushes", "What worked in this weather and daypart?"],
    ["trace_content_lineage", "What was built from this brief?"],
    ["get_graph_overview", "What is in the graph?"],
  ] as const;
  return (
    <Figure
      label="The six curated graph tools"
      caption="Each tool is a fixed, parameterized Cypher query in read mode that returns an answer plus evidence paths."
    >
      <div className="graph-tools">
        <ul className="graph-tools-list">
          {tools.map(([name, question]) => (
            <li key={name}>
              <code>{name}</code>
              <small>{question}</small>
            </li>
          ))}
        </ul>
        <div className="graph-tools-stores">
          <StepBox
            step={{
              title: "Neo4j Aura",
              caption: "Query API · read mode",
              tone: "store",
              glyph: "◉",
            }}
          />
          <span className="graph-tools-parity">= identical results =</span>
          <StepBox
            step={{
              title: "Local copy",
              caption: "same dataset, in memory",
              tone: "store",
              glyph: "◌",
            }}
          />
        </div>
      </div>
    </Figure>
  );
}

function Architecture() {
  return (
    <Figure
      label="How a turn travels through the system"
      caption="The browser talks to one Worker behind Cloudflare Access; each user's orchestrator reaches the model and three MCP servers."
    >
      <ol className="architecture">
        <li className="arch-tier">
          <span className="arch-tier-label">Browser</span>
          <StepBox
            step={{
              title: "Workbench",
              caption: "React · streaming chat",
              tone: "person",
              glyph: "▢",
            }}
          />
        </li>
        <li className="arch-tier">
          <span className="arch-tier-label">Cloudflare edge</span>
          <StepBox
            step={{
              title: "Worker + Access",
              caption: "identity, routing, assets",
              tone: "edge",
              glyph: "⛨",
            }}
          />
          <StepBox
            step={{
              title: "Orchestrator",
              caption: "Durable Object per user",
              tone: "edge",
              glyph: "◎",
            }}
          />
        </li>
        <li className="arch-tier">
          <span className="arch-tier-label">Model and tools</span>
          <StepBox
            step={{
              title: "Workers AI",
              caption: "gpt-oss-20b via AI Gateway",
              tone: "model",
              glyph: "◆",
            }}
          />
          <StepBox
            step={{ title: "Salesforce MCP", caption: "agents and Apex", tone: "tool", glyph: "☁" }}
          />
          <StepBox
            step={{
              title: "Campaign context",
              caption: "profile · Open-Meteo",
              tone: "tool",
              glyph: "☀",
            }}
          />
          <StepBox
            step={{ title: "Knowledge graph", caption: "Neo4j Aura", tone: "tool", glyph: "⋈" }}
          />
        </li>
        <li className="arch-tier">
          <span className="arch-tier-label">Storage</span>
          <StepBox
            step={{
              title: "Agent SQLite",
              caption: "messages, turn history",
              tone: "store",
              glyph: "▤",
            }}
          />
          <StepBox
            step={{
              title: "D1 + R2",
              caption: "confirmations, image drafts",
              tone: "store",
              glyph: "▤",
            }}
          />
        </li>
      </ol>
    </Figure>
  );
}

const DIAGRAMS: Record<DiagramId, () => ReactNode> = {
  "context-window": () => <ContextWindow />,
  "memory-layers": () => <MemoryLayers />,
  "context-defenses": () => (
    <Figure
      label="Context risks and defenses"
      caption="Each risk has a defense that doesn't depend on the model behaving."
    >
      <Lanes
        lanes={[
          {
            label: "Stale claims",
            steps: [
              { title: "Old reply says X", tone: "blocked", glyph: "!" },
              {
                title: "Re-check with tools",
                caption: "earlier replies are context, not evidence",
                tone: "guard",
                glyph: "✓",
              },
            ],
          },
          {
            label: "Prompt injection",
            steps: [
              {
                title: "“Ignore your rules”",
                caption: "hidden in data",
                tone: "blocked",
                glyph: "!",
              },
              {
                title: "No write tools",
                caption: "policy router · human confirmation",
                tone: "guard",
                glyph: "✓",
              },
            ],
          },
          {
            label: "Overflow",
            steps: [
              { title: "Reasoning uses the budget", tone: "blocked", glyph: "!" },
              {
                title: "4,096-token budget",
                caption: "text-only final step · recovery message",
                tone: "guard",
                glyph: "✓",
              },
            ],
          },
        ]}
      />
    </Figure>
  ),
  "rag-flow": () => (
    <Figure
      label="Retrieval-augmented generation"
      caption="Retrieval puts the right facts in the window before the model answers."
    >
      <Flow
        numbered
        steps={[
          { title: "Question", tone: "person", glyph: "?" },
          { title: "Retrieve", caption: "search your data", tone: "tool", glyph: "⌕" },
          { title: "Augment", caption: "add facts to the context", tone: "store", glyph: "+" },
          { title: "Generate", caption: "answer from those facts", tone: "model", glyph: "◆" },
        ]}
      />
    </Figure>
  ),
  "graph-path": () => <GraphPath />,
  "graph-tools": () => <GraphTools />,
  architecture: () => <Architecture />,
  workspace: () => (
    <Figure
      label="How the workspace is built and used"
      caption="Code turns tool results into context and records; the model drafts into the focus; confirmed writes act on the focus version shown."
    >
      <Lanes
        lanes={[
          {
            label: "Tools",
            steps: [
              {
                title: "Tool result",
                caption: "weather, graph, Salesforce",
                tone: "tool",
                glyph: "▶",
              },
              {
                title: "Context and records",
                caption: "built by code, any system",
                tone: "store",
                glyph: "▤",
              },
            ],
          },
          {
            label: "Drafting",
            steps: [
              { title: "Model drafts", tone: "model", glyph: "◆" },
              {
                title: "update_focus",
                caption: "local, workspace only",
                tone: "guard",
                glyph: "✎",
              },
              { title: "Focus v1, v2…", caption: "every version kept", tone: "output", glyph: "◎" },
            ],
          },
          {
            label: "Writes",
            steps: [
              { title: "Confirm", caption: "the version on screen", tone: "person", glyph: "☑" },
              { title: "Signed write", tone: "guard", glyph: "⛨" },
              { title: "Record updated", tone: "output", glyph: "✓" },
            ],
          },
        ]}
      />
    </Figure>
  ),
  "model-guards": () => (
    <Figure
      label="The model and its known quirks"
      caption="The quirks are predictable, so each one has a targeted guard."
    >
      <Lanes
        lanes={[
          {
            label: "Every turn",
            steps: [
              {
                title: "gpt-oss-20b",
                caption: "open-weight reasoning model",
                tone: "model",
                glyph: "◆",
              },
              { title: "AI Gateway", caption: "logs, cost, caching", tone: "edge", glyph: "⛨" },
            ],
          },
          {
            label: "Known quirks",
            steps: [
              { title: "Tool call in its text", tone: "blocked", glyph: "!" },
              { title: "Channel markup in names", tone: "blocked", glyph: "!" },
              { title: "Guards repair both", tone: "guard", glyph: "✓" },
            ],
          },
        ]}
      />
    </Figure>
  ),
  mcp: () => (
    <Figure
      label="How MCP works"
      caption="Clients discover tools with tools/list and run them with tools/call; the transport can be HTTP or in-memory."
    >
      <Flow
        steps={[
          { title: "Orchestrator", caption: "MCP client", tone: "edge", glyph: "◎" },
          {
            title: "tools/list",
            caption: "names, descriptions, schemas",
            tone: "tool",
            glyph: "☰",
          },
          { title: "tools/call", caption: "validated JSON arguments", tone: "tool", glyph: "▶" },
          { title: "Result", caption: "structured content", tone: "output", glyph: "◧" },
        ]}
      />
      <Cards
        cards={[
          {
            title: "Salesforce Hosted MCP",
            caption: "14 governed tools · remote · per-user OAuth",
            tone: "tool",
            glyph: "☁",
          },
          {
            title: "Campaign context",
            caption: "profile + weather · in-process and HTTP",
            tone: "tool",
            glyph: "☀",
          },
          {
            title: "Knowledge graph",
            caption: "six curated queries · in-process and HTTP",
            tone: "tool",
            glyph: "⋈",
          },
        ]}
      />
    </Figure>
  ),
  salesforce: () => (
    <Figure
      label="Reads and writes in Salesforce"
      caption="Reads go through agents on Hosted MCP; writes are Apex actions behind a human confirmation."
    >
      <Lanes
        lanes={[
          {
            label: "Read",
            steps: [
              { title: "Orchestrator", tone: "edge", glyph: "◎" },
              { title: "Hosted MCP tool", tone: "tool", glyph: "☁" },
              { title: "Agentforce agent", caption: "Agent Script", tone: "model", glyph: "◆" },
              { title: "Grounded answer", tone: "output", glyph: "✓" },
            ],
          },
          {
            label: "Write",
            steps: [
              {
                title: "Confirmation card",
                caption: "a person approves",
                tone: "person",
                glyph: "☑",
              },
              { title: "Signed request", tone: "guard", glyph: "⛨" },
              { title: "Apex action", tone: "tool", glyph: "⚙" },
              { title: "Record read-back", tone: "output", glyph: "✓" },
            ],
          },
        ]}
      />
    </Figure>
  ),
  routing: () => (
    <Figure
      label="How a message is routed"
      caption="Two deterministic routers run before the model. Forced tools come one per step, then the model answers with no tools."
    >
      <Lanes
        lanes={[
          {
            label: "Write or forbidden",
            steps: [
              { title: "Message", tone: "person", glyph: "✉" },
              { title: "Policy router", tone: "guard", glyph: "⛨" },
              { title: "Fixed reply", caption: "no model call", tone: "blocked", glyph: "■" },
            ],
          },
          {
            label: "Clear intent",
            steps: [
              { title: "Intent router", tone: "guard", glyph: "⑂" },
              { title: "Tool plan", caption: "one forced tool per step", tone: "tool", glyph: "▶" },
              { title: "Answer", caption: "no tools", tone: "model", glyph: "◆" },
            ],
          },
          {
            label: "Unclear",
            steps: [
              { title: "Model chooses", caption: "from allowed tools", tone: "model", glyph: "◆" },
              { title: "Answer", tone: "output", glyph: "✓" },
            ],
          },
        ]}
      />
    </Figure>
  ),
  reliability: () => (
    <Figure
      label="Tool-call failures and their guards"
      caption="The forced-tool middleware sits between the model and the tools."
    >
      <Lanes
        lanes={[
          {
            label: "Call in text",
            steps: [
              { title: "JSON in reasoning", tone: "blocked", glyph: "!" },
              { title: "Salvage if schema matches", tone: "guard", glyph: "✓" },
            ],
          },
          {
            label: "Bad name",
            steps: [
              { title: "name<|channel|>…", tone: "blocked", glyph: "!" },
              { title: "Repair if one tool matches", tone: "guard", glyph: "✓" },
            ],
          },
          {
            label: "No call",
            steps: [
              { title: "Nothing usable", tone: "blocked", glyph: "!" },
              { title: "Retry once", tone: "guard", glyph: "↻" },
            ],
          },
          {
            label: "Timeouts",
            steps: [
              { title: "Stalled turn", tone: "blocked", glyph: "!" },
              { title: "Explain, don't go silent", tone: "guard", glyph: "✓" },
            ],
          },
        ]}
      />
    </Figure>
  ),
  governance: () => (
    <Figure
      label="The confirmation flow"
      caption="The same four steps protect every write; operators can also pause writes or tools without a deploy."
    >
      <Flow
        numbered
        steps={[
          {
            title: "Preflight",
            caption: "hash of the exact arguments, 5-minute expiry",
            tone: "edge",
            glyph: "#",
          },
          {
            title: "Human confirms",
            caption: "card shows what will change",
            tone: "person",
            glyph: "☑",
          },
          { title: "Signed execute", caption: "HMAC, verified by Apex", tone: "guard", glyph: "⛨" },
          {
            title: "Read-back",
            caption: "Salesforce returns the record",
            tone: "output",
            glyph: "✓",
          },
        ]}
      />
    </Figure>
  ),
  "ui-layers": () => (
    <Figure
      label="How answers render"
      caption="Every surface has a safe, accessible rendering path."
    >
      <Cards
        cards={[
          { title: "Markdown", caption: "model text · never raw HTML", tone: "model", glyph: "¶" },
          { title: "HXL card", caption: "typed Salesforce widget", tone: "tool", glyph: "▦" },
          {
            title: "Native fallback",
            caption: "same contract, accessible",
            tone: "output",
            glyph: "▣",
          },
          {
            title: "Graph evidence",
            caption: "paths with text alternatives",
            tone: "store",
            glyph: "⋈",
          },
        ]}
      />
    </Figure>
  ),
  observability: () => (
    <Figure
      label="Three ways to see what happened"
      caption="Engineers read the trace; reviewers read history; auditors export it."
    >
      <Cards
        cards={[
          {
            title: "Technical trace",
            caption: "under each answer",
            tone: "edge",
            glyph: "≋",
            points: ["reasoning start / end", "tool input / output", "timings and tokens"],
          },
          {
            title: "Turn history",
            caption: "History view · 14 days",
            tone: "store",
            glyph: "▤",
            points: ["interpretation", "tool calls", "outcome"],
          },
          {
            title: "Audit export",
            caption: "JSON download",
            tone: "output",
            glyph: "⇩",
            points: ["confirmed writes", "turn summaries"],
          },
        ]}
      />
    </Figure>
  ),
  evaluations: () => (
    <Figure
      label="What the evaluations measure"
      caption="Three suites run the production pipeline; every turn is scored on four checks."
    >
      <Cards
        cards={[
          {
            title: "Demo scenarios",
            caption: "Quickstart prompts, full pipeline",
            tone: "person",
            glyph: "▶",
          },
          {
            title: "Pipeline routing",
            caption: "20 prompts, as evaluators see them",
            tone: "guard",
            glyph: "⑂",
          },
          {
            title: "Model-only routing",
            caption: "no routers: raw model skill",
            tone: "model",
            glyph: "◆",
          },
        ]}
      />
      <ul className="diagram-chips" aria-label="Scores">
        {["Right tool or plan", "Answered", "No tool errors", "No false write claims"].map(
          (score) => (
            <li key={score}>✓ {score}</li>
          ),
        )}
      </ul>
    </Figure>
  ),
  images: () => (
    <Figure
      label="From concept to Salesforce file"
      caption="Drafts stay private until a person confirms; Salesforce verifies the file hash."
    >
      <Flow
        steps={[
          { title: "Concept", caption: "PII and injection checks", tone: "person", glyph: "✎" },
          { title: "FLUX.2 klein", caption: "1024 × 1024 draft", tone: "model", glyph: "◆" },
          { title: "R2 draft", caption: "private, 7 days", tone: "store", glyph: "▤" },
          { title: "Confirm attach", tone: "guard", glyph: "☑" },
          { title: "Campaign file", caption: "hash checked by Apex", tone: "output", glyph: "✓" },
        ]}
      />
    </Figure>
  ),
  "push-plan": () => (
    <Figure
      label="The push-campaign tool plan"
      caption="Five forced tools in order: context, past results, the content draft, then the workspace focus. The model then presents the draft."
    >
      <Flow
        numbered
        steps={[
          {
            title: "Restaurant profile",
            caption: "menu, favorites, voice",
            tone: "tool",
            glyph: "☰",
          },
          { title: "Current weather", caption: "Open-Meteo, live", tone: "tool", glyph: "☀" },
          { title: "Past pushes", caption: "knowledge graph", tone: "store", glyph: "⋈" },
          { title: "Content draft", caption: "Salesforce agent", tone: "tool", glyph: "☁" },
          { title: "Workspace focus", caption: "saved as version 1", tone: "output", glyph: "◎" },
        ]}
      />
    </Figure>
  ),
};

export function Diagram({ id }: { id: DiagramId }) {
  return <>{DIAGRAMS[id]()}</>;
}

export const DIAGRAM_IDS = Object.keys(DIAGRAMS) as DiagramId[];
