import {
  type Confirmation,
  MARKETING_BRIEF_FIELDS,
  SALESFORCE_TOOL_DETAILS,
  WRITE_TOOL_BY_ACTION,
} from "@workbench/contracts";
import { relativeTime, salesforceRecordUrl } from "@workbench/ui";
import { AgentDetail } from "./SalesforceAgents";

/**
 * What a confirmed Marketing Cloud write asks the Campaign Creation agent to do, as the server
 * authored it, and which agent actions will run.
 */
export function MarketingWriteDetails({ confirmation }: { confirmation: Confirmation }) {
  const write = confirmation.write;
  if (!write) return null;
  const detail = SALESFORCE_TOOL_DETAILS[WRITE_TOOL_BY_ACTION[confirmation.action]];
  return (
    <div className="write-plan">
      {write.kind === "brief" ? (
        <>
          <p className="write-plan-target">
            <strong>Save the brief “{write.brief.name}” in Marketing Cloud</strong>, then draft its
            campaign preview
          </p>
          <dl className="write-plan-fields">
            {MARKETING_BRIEF_FIELDS.filter(([key]) => key !== "name" && write.brief[key]).map(
              ([key, label]) => (
                <div key={key}>
                  <dt>{label}</dt>
                  <dd>{write.brief[key]}</dd>
                </div>
              ),
            )}
          </dl>
        </>
      ) : (
        <p className="write-plan-target">
          <strong>Create the campaign and its flow</strong> from the brief{" "}
          <a href={salesforceRecordUrl("Brief", write.briefId)} target="_blank" rel="noreferrer">
            “{write.briefName}” <span aria-hidden="true">↗</span>
          </a>{" "}
          and its confirmed preview
        </p>
      )}
      {detail && (
        <details className="write-plan-agent" open>
          <summary className="write-plan-agent-summary">
            Marketing Cloud agent that does the work
          </summary>
          <AgentDetail detail={detail} />
        </details>
      )}
    </div>
  );
}

/** The Salesforce permission checks run as the user before this confirmation was prepared. */
export function PermissionDetails({ confirmation }: { confirmation: Confirmation }) {
  const report = confirmation.permissions;
  if (!report) return null;
  return (
    <section className="permission-check" aria-label="Salesforce permission check">
      <p className="permission-check-title">
        <span aria-hidden="true">{report.allowed ? "✓" : "✕"}</span>
        <strong>Salesforce permission check</strong>
        <span className="permission-check-meta">
          {report.source === "salesforce" ? `as ${report.user}` : "local fixture"} ·{" "}
          {relativeTime(report.checkedAt)}
        </span>
      </p>
      <ul>
        {report.checks.map((check) => (
          <li
            key={check.label}
            className={`permission-item ${check.passed ? "is-passed" : "is-failed"}`}
          >
            <span className="permission-mark" aria-hidden="true">
              {check.passed ? "✓" : "✕"}
            </span>
            <span>
              <strong>{check.label}</strong>
              <span className="sr-only">{check.passed ? " passed" : " failed"}</span>
              <small className="permission-detail">{check.detail}</small>
            </span>
          </li>
        ))}
      </ul>
      <details className="delegation">
        <summary>Who checks what</summary>
        <dl>
          <div>
            <dt>The model</dt>
            <dd>Drafts and proposes. It has no write tools and can’t save anything on its own.</dd>
          </div>
          <div>
            <dt>The workbench</dt>
            <dd>
              Builds the request from your draft, asks Salesforce whether you may make it, and binds
              the exact values into a hash. It never decides who may write, and it never creates
              briefs or campaigns itself.
            </dd>
          </div>
          <div>
            <dt>The Marketing Cloud agent</dt>
            <dd>
              For briefs and campaigns, the Campaign Creation agent runs Marketing Cloud’s standard
              actions as you after you confirm; the workbench then reads the records back.
            </dd>
          </div>
          <div>
            <dt>You</dt>
            <dd>Review exactly what will be written and confirm it.</dd>
          </div>
          <div>
            <dt>Salesforce</dt>
            <dd>
              Owns authorization: your profile, permission sets, field-level security, and sharing.
              It checks them before the card appears and again when the agent’s actions or the Apex
              action run as you. For review tasks and images, Apex also verifies the signed
              confirmation and hash before writing.
            </dd>
          </div>
        </dl>
      </details>
    </section>
  );
}
