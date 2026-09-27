import type { WriteProgress as Progress } from "@northstar/contracts";
import { useEffect, useRef } from "react";

const STATUS_LABELS: Record<Progress["steps"][number]["status"], string> = {
  pending: "Waiting",
  active: "Working",
  done: "Done",
  skipped: "Skipped",
  failed: "Failed",
};

const seconds = (from?: string, to?: string) =>
  from && to ? `${Math.max(0, (Date.parse(to) - Date.parse(from)) / 1000).toFixed(1)} s` : "";

function Steps({ progress }: { progress: Progress }) {
  return (
    <ol className="write-progress-steps">
      {progress.steps.map((step) => (
        <li key={step.id} className={`write-step is-${step.status}`}>
          <span className="write-step-mark" aria-hidden="true">
            {step.status === "done"
              ? "✓"
              : step.status === "failed"
                ? "✕"
                : step.status === "skipped"
                  ? "–"
                  : step.status === "active"
                    ? ""
                    : "·"}
          </span>
          <span className="write-step-body">
            <span className="write-step-label">
              {step.label}
              <span className="sr-only"> ({STATUS_LABELS[step.status]})</span>
            </span>
            {step.detail && <span className="write-step-detail">{step.detail}</span>}
          </span>
          {step.status !== "pending" && step.status !== "active" && (
            <span className="write-step-time">{seconds(step.startedAt, step.endedAt)}</span>
          )}
        </li>
      ))}
    </ol>
  );
}

/**
 * A confirmation's preparation, or a confirmed write's steps. While it runs, the steps update live as the Worker publishes them;
 * afterwards they stay as a collapsible record of what happened behind the scenes.
 */
export function WriteProgress({
  progress,
  running,
  phase = "execute",
}: {
  progress: Progress | null;
  running: boolean;
  phase?: Progress["phase"];
}) {
  const panel = useRef<HTMLElement>(null);
  // The steps appear below the confirmation card and grow as the Worker reports each one, so
  // the panel stays in view while the write runs.
  useEffect(() => {
    const element = panel.current;
    if (!running || !element) return;
    const reveal = () => element.scrollIntoView({ block: "end" });
    reveal();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(reveal);
    observer.observe(element);
    return () => observer.disconnect();
  }, [running]);
  if (running)
    return (
      <section
        ref={panel}
        className="write-progress is-running"
        aria-label={
          phase === "prepare" ? "Preparing the confirmation" : "Running the confirmed write"
        }
      >
        <p className="write-progress-heading" role="status" aria-live="polite">
          <span className="write-spinner" aria-hidden="true" />
          {progress?.steps.find((step) => step.status === "active")?.label ??
            (progress?.finishedAt
              ? "Finishing up…"
              : phase === "prepare"
                ? "Preparing the confirmation…"
                : "Sending your confirmation…")}
        </p>
        {progress && <Steps progress={progress} />}
      </section>
    );
  if (!progress?.finishedAt) return null;
  const failed = progress.outcome === "failed";
  return (
    <details
      className={`write-progress is-finished ${failed ? "is-failed" : ""}`}
      open={failed}
      data-testid="write-progress"
    >
      <summary>
        Behind the scenes · {progress.title} · {failed ? "stopped" : "done"} in{" "}
        {seconds(progress.startedAt, progress.finishedAt)}
      </summary>
      <Steps progress={progress} />
    </details>
  );
}
