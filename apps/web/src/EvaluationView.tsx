import { EVAL_CHECKS, type EvalReport, EvalReportSchema } from "@northstar/evals/report";
import { useEffect, useMemo, useState } from "react";

type LoadState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "error"; message: string }
  | { status: "ready"; report: EvalReport };

type Suite = EvalReport["methodology"]["suites"][number]["id"];

const percent = (value: number) => `${Math.round(value * 100)}%`;
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

export function EvaluationView({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [suite, setSuite] = useState<Suite>("demo-scenarios");
  const [failureModel, setFailureModel] = useState<string>("all");

  useEffect(() => {
    fetch("/evals/latest.json", { cache: "no-store" })
      .then(async (response) => {
        // The asset router answers unknown paths with the app shell, so non-JSON means no report.
        const isJson = response.headers.get("content-type")?.includes("application/json");
        if (response.status === 404 || (response.ok && !isJson))
          return setState({ status: "missing" });
        if (!response.ok)
          throw new Error(`The evaluation report returned HTTP ${response.status}.`);
        let body: unknown;
        try {
          body = await response.json();
        } catch {
          throw new Error("The published evaluation report is not valid JSON.");
        }
        const parsed = EvalReportSchema.safeParse(body);
        if (!parsed.success) throw new Error("The evaluation report does not match its contract.");
        setState({ status: "ready", report: parsed.data });
      })
      .catch((error: unknown) =>
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "The evaluation report is unavailable.",
        }),
      );
  }, []);

  return (
    <section className="evaluations-view" aria-labelledby="evaluations-title">
      <div className="section-header">
        <div>
          <p className="kicker">Quality</p>
          <h2 id="evaluations-title">Evaluations</h2>
        </div>
        <button type="button" className="text-button evaluations-back" onClick={onClose}>
          Back to workspace
        </button>
      </div>
      <div className="evaluations-body">
        {state.status === "loading" && <p role="status">Loading the latest evaluation run…</p>}
        {state.status === "missing" && (
          <div className="evaluation-empty" role="status">
            <strong>No evaluation run has been published yet.</strong>
            <p>
              Run <code>pnpm eval:live</code> with Workers AI access. It evaluates the production
              orchestrator pipeline across models and writes{" "}
              <code>apps/web/public/evals/latest.json</code>, which this page renders.
            </p>
          </div>
        )}
        {state.status === "error" && (
          <div className="error-banner" role="alert">
            {state.message}
          </div>
        )}
        {state.status === "ready" && (
          <ReportView
            report={state.report}
            suite={suite}
            onSuite={setSuite}
            failureModel={failureModel}
            onFailureModel={setFailureModel}
          />
        )}
      </div>
    </section>
  );
}

function ReportView({
  report,
  suite,
  onSuite,
  failureModel,
  onFailureModel,
}: {
  report: EvalReport;
  suite: Suite;
  onSuite: (suite: Suite) => void;
  failureModel: string;
  onFailureModel: (model: string) => void;
}) {
  const labels = new Map(report.models.map((model) => [model.id, model.label]));
  const label = (id: string) => labels.get(id) ?? id;
  const included = report.models.filter((model) => model.included);
  const summary = (model: string, suiteId: Suite) =>
    report.summaries.find((entry) => entry.model === model && entry.suite === suiteId);
  const suiteMeta = report.methodology.suites.find((entry) => entry.id === suite);
  const checkLabels = new Map(report.methodology.checks.map((check) => [check.id, check.label]));
  const failures = useMemo(
    () =>
      report.results.filter(
        (result) =>
          !result.passed &&
          result.suite === suite &&
          (failureModel === "all" || result.model === failureModel),
      ),
    [report, suite, failureModel],
  );
  const demoCases = [
    ...new Map(
      report.results
        .filter((result) => result.suite === "demo-scenarios")
        .map((result) => [result.caseId, result.prompt]),
    ),
  ];

  return (
    <>
      <p className="evaluation-meta">
        Run {new Date(report.generatedAt).toLocaleString()} · commit <code>{report.gitSha}</code> ·
        production model <code>{report.productionModel}</code> ·{" "}
        {report.results.length.toLocaleString()} turns
      </p>

      <section className="evaluation-card" aria-labelledby="evaluation-models">
        <h3 id="evaluation-models">Model comparison</h3>
        <p className="evaluation-note">
          A turn passes only when every check passes. Latency and tokens cover model turns only.
        </p>
        <div className="evaluation-table-wrap">
          <table className="evaluation-table">
            <thead>
              <tr>
                <th scope="col">Model</th>
                {report.methodology.suites.map((entry) => (
                  <th scope="col" key={entry.id}>
                    {entry.label}
                  </th>
                ))}
                <th scope="col">Median latency</th>
                <th scope="col">Slow runs (p90)</th>
                <th scope="col">Output tokens</th>
              </tr>
            </thead>
            <tbody>
              {included.map((model) => {
                const demo = summary(model.id, "demo-scenarios");
                return (
                  <tr key={model.id}>
                    <th scope="row">
                      {model.label}
                      {model.id === report.productionModel && (
                        <span className="evaluation-badge">In production</span>
                      )}
                    </th>
                    {report.methodology.suites.map((entry) => {
                      const cell = summary(model.id, entry.id);
                      return (
                        <td key={entry.id}>
                          {cell ? <PassRate passed={cell.passed} total={cell.total} /> : "—"}
                        </td>
                      );
                    })}
                    <td>{demo ? seconds(demo.latencyP50Ms) : "—"}</td>
                    <td>{demo ? seconds(demo.latencyP90Ms) : "—"}</td>
                    <td>{demo ? demo.meanOutputTokens.toLocaleString() : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {report.models.some((model) => !model.included) && (
          <ul className="evaluation-excluded">
            {report.models
              .filter((model) => !model.included)
              .map((model) => (
                <li key={model.id}>
                  {model.label} not evaluated{model.note ? `: ${model.note}` : "."}
                </li>
              ))}
          </ul>
        )}
      </section>

      <section className="evaluation-card" aria-labelledby="evaluation-checks">
        <div className="evaluation-card-heading">
          <h3 id="evaluation-checks">Checks by model</h3>
          <fieldset className="evaluation-tabs">
            <legend className="sr-only">Evaluation suite</legend>
            {report.methodology.suites.map((entry) => (
              <button
                type="button"
                key={entry.id}
                aria-pressed={entry.id === suite}
                onClick={() => onSuite(entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </fieldset>
        </div>
        {suiteMeta && (
          <p className="evaluation-note">
            {suiteMeta.description} {suiteMeta.trials} trial{suiteMeta.trials === 1 ? "" : "s"} per
            prompt.
          </p>
        )}
        <div className="evaluation-table-wrap">
          <table className="evaluation-table">
            <thead>
              <tr>
                <th scope="col">Model</th>
                {EVAL_CHECKS.map((check) => (
                  <th scope="col" key={check}>
                    {checkLabels.get(check) ?? check}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {included.map((model) => {
                const cell = summary(model.id, suite);
                return (
                  <tr key={model.id}>
                    <th scope="row">{model.label}</th>
                    {EVAL_CHECKS.map((check) => (
                      <td key={check}>{cell ? <RateBar value={cell.checkRates[check]} /> : "—"}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="evaluation-card" aria-labelledby="evaluation-scenarios">
        <h3 id="evaluation-scenarios">Demo scenarios</h3>
        <div className="evaluation-table-wrap">
          <table className="evaluation-table">
            <thead>
              <tr>
                <th scope="col">Scenario</th>
                {included.map((model) => (
                  <th scope="col" key={model.id}>
                    {model.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {demoCases.map(([caseId, prompt]) => (
                <tr key={caseId}>
                  <th scope="row" className="evaluation-prompt">
                    {prompt}
                  </th>
                  {included.map((model) => {
                    const runs = report.results.filter(
                      (result) =>
                        result.suite === "demo-scenarios" &&
                        result.caseId === caseId &&
                        result.model === model.id,
                    );
                    return (
                      <td key={model.id}>
                        {runs.length ? (
                          <PassRate
                            passed={runs.filter((result) => result.passed).length}
                            total={runs.length}
                          />
                        ) : (
                          "—"
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="evaluation-card" aria-labelledby="evaluation-failures">
        <div className="evaluation-card-heading">
          <h3 id="evaluation-failures">
            Failed turns · {suiteMeta?.label ?? suite} ({failures.length})
          </h3>
          <label className="evaluation-filter">
            Model{" "}
            <select value={failureModel} onChange={(event) => onFailureModel(event.target.value)}>
              <option value="all">All models</option>
              {included.map((model) => (
                <option value={model.id} key={model.id}>
                  {model.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {failures.length === 0 ? (
          <p className="evaluation-note">No failed turns for this selection.</p>
        ) : (
          <ol className="evaluation-failures">
            {failures.slice(0, 60).map((result) => (
              <li
                className="evaluation-failure"
                key={`${result.model}-${result.caseId}-${result.trial}`}
              >
                <details>
                  <summary>
                    <strong>{result.prompt}</strong>
                    <span>
                      {label(result.model)} · expected <code>{result.expected}</code> · called{" "}
                      <code>{result.toolCalled ?? "no tool"}</code> · failed {result.failure}
                    </span>
                  </summary>
                  <dl>
                    <div>
                      <dt>Route</dt>
                      <dd>{result.route}</dd>
                    </div>
                    <div>
                      <dt>Step finish reasons</dt>
                      <dd>{result.steps || "—"}</dd>
                    </div>
                    <div>
                      <dt>Latency</dt>
                      <dd>{seconds(result.latencyMs)}</dd>
                    </div>
                    <div>
                      <dt>Answer excerpt</dt>
                      <dd>{result.excerpt || "No text"}</dd>
                    </div>
                  </dl>
                </details>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="evaluation-card" aria-labelledby="evaluation-method">
        <h3 id="evaluation-method">Methodology</h3>
        <p>{report.methodology.summary}</p>
        <h4>Pipeline under test</h4>
        <ol>
          {report.methodology.pipeline.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <h4>Tool results</h4>
        <p>{report.methodology.toolResults}</p>
        <h4>Checks</h4>
        <dl className="evaluation-definitions">
          {report.methodology.checks.map((check) => (
            <div key={check.id}>
              <dt>{check.label}</dt>
              <dd>{check.definition}</dd>
            </div>
          ))}
        </dl>
        <h4>Limitations</h4>
        <ul>
          {report.methodology.limitations.map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
        </ul>
      </section>
    </>
  );
}

function PassRate({ passed, total }: { passed: number; total: number }) {
  const rate = passed / total;
  return (
    <span className={`pass-rate ${rate >= 0.9 ? "good" : rate >= 0.7 ? "fair" : "poor"}`}>
      {percent(rate)} <small>{`${passed}/${total}`}</small>
    </span>
  );
}

function RateBar({ value }: { value: number }) {
  return (
    <span className="rate-bar">
      <span className="rate-track" aria-hidden="true">
        <span className="rate-fill" style={{ width: percent(value) }} />
      </span>
      {percent(value)}
    </span>
  );
}
