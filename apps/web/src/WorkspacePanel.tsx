import type { WorkingRecord, WorkingSet } from "@northstar/contracts";
import { InsightBoard, recordUrl, relativeTime } from "@northstar/ui";
import { readableToolName } from "./turn-trace";

/** Records grouped by the system that holds them, in first-seen order. */
export function recordsBySystem(records: readonly WorkingRecord[]) {
  const groups = new Map<string, { label: string; records: WorkingRecord[] }>();
  for (const record of records) {
    const group = groups.get(record.system) ?? { label: record.systemLabel, records: [] };
    group.records.push(record);
    groups.set(record.system, group);
  }
  return [...groups.entries()].map(([system, group]) => ({ system, ...group }));
}

/**
 * The chat's working set: records it opened or created, in any connected system, and the
 * context its tools returned. It starts empty with each new chat.
 */
export function WorkspacePanel({ workingSet }: { workingSet: WorkingSet }) {
  const { records, cards } = workingSet;
  if (records.length === 0 && cards.length === 0)
    return (
      <div className="workspace-empty">
        <span className="workspace-empty-mark" aria-hidden="true">
          ◌
        </span>
        <strong>Nothing in this chat yet</strong>
        <p>
          As you chat, the records you open or create and the data tools return, such as weather,
          restaurant details, graph evidence, and campaign results, collect here.
        </p>
        <p className="workspace-empty-hint">New chat always starts with an empty workspace.</p>
      </div>
    );
  return (
    <div className="workspace-sections">
      {records.length > 0 && (
        <section className="workspace-section" aria-labelledby="workspace-records-title">
          <h3 id="workspace-records-title">
            Records <span className="count">{records.length}</span>
          </h3>
          {recordsBySystem(records).map((group) => (
            <div key={group.system} className="record-group">
              <p className={`system-badge system-${group.system}`}>{group.label}</p>
              <ul className="record-list">
                {group.records.map((record) => {
                  const link = recordUrl(record);
                  return (
                    <li key={record.key} className="record-item" data-testid="workspace-record">
                      <div>
                        <strong>{record.title}</strong>
                        <span className="record-meta">
                          {record.objectType} ·{" "}
                          <span className={`record-relation relation-${record.relation}`}>
                            {record.relation === "created" ? "Created" : "Opened"}
                          </span>{" "}
                          by {readableToolName(record.via)} ·{" "}
                          <time dateTime={record.addedAt}>{relativeTime(record.addedAt)}</time>
                        </span>
                      </div>
                      {link && (
                        <a className="record-link" href={link} target="_blank" rel="noreferrer">
                          Open in {record.systemLabel} <span aria-hidden="true">↗</span>
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </section>
      )}
      {cards.length > 0 && (
        <section className="workspace-section" aria-labelledby="workspace-context-title">
          <h3 id="workspace-context-title">
            Context <span className="count">{cards.length}</span>
          </h3>
          <InsightBoard tiles={cards} />
        </section>
      )}
    </div>
  );
}
