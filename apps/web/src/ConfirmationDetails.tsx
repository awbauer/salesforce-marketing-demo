import type { Confirmation } from "@northstar/contracts";
import { relativeTime, salesforceRecordUrl } from "@northstar/ui";

/** What a confirmed record write will create or update, as the server authored it. */
export function RecordWriteDetails({ confirmation }: { confirmation: Confirmation }) {
  const write = confirmation.write;
  if (!write) return null;
  const rows: Array<[string, string | undefined]> = [
    ["Channel", write.channel],
    ["Subject or headline", write.subject],
    ["Preheader", write.preheader],
    ["Objective", write.objective],
    ["Audience", write.audience],
    ["Send time", write.sendTime],
  ];
  return (
    <div className="write-plan">
      <p className="write-plan-target">
        <strong>
          {write.recordId ? "Update" : "Create"} {write.objectLabel.toLowerCase()} “{write.title}”
        </strong>
        {write.objectType !== "Campaign" && (
          <span>
            {write.newCampaignName ? (
              <>
                {" "}
                on a <strong>new campaign</strong> “{write.newCampaignName}”
                {write.brand ? ` (${write.brand})` : ""}
              </>
            ) : write.campaignId ? (
              <>
                {" "}
                on{" "}
                <a
                  href={salesforceRecordUrl("Campaign", write.campaignId)}
                  target="_blank"
                  rel="noreferrer"
                >
                  campaign {write.campaignId} <span aria-hidden="true">↗</span>
                </a>
              </>
            ) : null}
          </span>
        )}
      </p>
      <dl className="write-plan-fields">
        {rows
          .filter((row): row is [string, string] => Boolean(row[1]))
          .map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        <div className="write-plan-body">
          <dt>{write.objectType === "Campaign" ? "Description" : "Body"}</dt>
          <dd>{write.body}</dd>
        </div>
      </dl>
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
              Builds the write from your draft, asks Salesforce whether you may make it, binds the
              exact values into a hash, and signs your confirmation. It never decides who may write.
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
              It checks them before the card appears and again during the write (user mode),
              verifies the signature and hash, then writes and reads the record back.
            </dd>
          </div>
        </dl>
      </details>
    </section>
  );
}
