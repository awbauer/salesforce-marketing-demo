import {
  PHASE_2_CURATED_TOOLS,
  SALESFORCE_AGENTS,
  SALESFORCE_TOOL_DETAILS,
  type SalesforceToolDetail,
} from "@workbench/contracts";
import type { UIMessage } from "ai";

export type SalesforceCall = {
  toolCallId: string;
  tool: string;
  detail: SalesforceToolDetail;
  status: "running" | "returned" | "error";
};

/** The Salesforce catalog tool a (possibly prefixed) tool name refers to. */
export function salesforceToolName(name: string) {
  return PHASE_2_CURATED_TOOLS.find((tool) => name === tool || name.endsWith(`_${tool}`)) ?? null;
}

/** The Salesforce tool calls in an assistant message, with the agent behind each. */
export function salesforceCalls(message: UIMessage): SalesforceCall[] {
  return message.parts.flatMap((part) => {
    const name =
      part.type === "dynamic-tool" && "toolName" in part
        ? String(part.toolName)
        : part.type.startsWith("tool-")
          ? part.type.slice(5)
          : null;
    const tool = name ? salesforceToolName(name) : null;
    const detail = tool ? SALESFORCE_TOOL_DETAILS[tool] : undefined;
    if (!tool || !detail || !("toolCallId" in part)) return [];
    const state = "state" in part ? String(part.state) : "";
    return [
      {
        toolCallId: String(part.toolCallId),
        tool,
        detail,
        status:
          state === "output-error"
            ? "error"
            : state === "output-available"
              ? "returned"
              : "running",
      },
    ];
  });
}

/** One Salesforce agent (or Apex action) and the actions behind a tool. */
export function AgentDetail({ detail, status }: { detail: SalesforceToolDetail; status?: string }) {
  const agent = detail.agent ? SALESFORCE_AGENTS[detail.agent] : null;
  return (
    <div className="sf-agent">
      <p className="sf-agent-name">
        <strong>{agent ? agent.label : "Salesforce Apex action"}</strong>
        {agent && <span className="sf-agent-kind">{agent.kind}</span>}
        {status && <span className={`sf-agent-status status-${status}`}>{status}</span>}
      </p>
      <dl className="sf-agent-meta">
        {detail.agent && (
          <div>
            <dt>Agent</dt>
            <dd>
              <code className="sf-code">{detail.agent}</code>
              {agent?.template && (
                <>
                  {" "}
                  · template <code className="sf-code">{agent.template}</code>
                </>
              )}
            </dd>
          </div>
        )}
        {detail.subagent && (
          <div>
            <dt>Subagent</dt>
            <dd>{detail.subagent}</dd>
          </div>
        )}
        <div>
          <dt>{detail.agent ? "Actions" : "Action"}</dt>
          <dd>
            <ol className="sf-agent-actions">
              {detail.actions.map((action) => (
                <li key={action.target + action.label}>
                  {action.label} <code className="sf-code">{action.target}</code>
                </li>
              ))}
            </ol>
          </dd>
        </div>
        {detail.creates && (
          <div>
            <dt>Creates</dt>
            <dd>{detail.creates.join(", ")}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

/**
 * The Salesforce agents an answer used: for each tool call, the agent, its type and template,
 * the subagent that handled it, and the standard or custom actions behind it.
 */
export function SalesforceAgentsPanel({ message }: { message: UIMessage }) {
  const calls = salesforceCalls(message);
  if (!calls.length) return null;
  return (
    <details className="sf-agents" open>
      <summary className="sf-agents-summary">
        Salesforce agents{" "}
        <span className="sf-agents-count">
          · {calls.length} call{calls.length === 1 ? "" : "s"}
        </span>
      </summary>
      <ol>
        {calls.map((call) => (
          <li key={call.toolCallId}>
            <p className="sf-agent-tool">
              <code className="sf-code">{call.tool}</code>
            </p>
            <AgentDetail detail={call.detail} status={call.status} />
          </li>
        ))}
      </ol>
    </details>
  );
}
