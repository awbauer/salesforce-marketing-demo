import {
  TURN_TRACE_PART_ID,
  TURN_TRACE_PART_TYPE,
  type TurnTrace,
  type TurnTraceEvent,
} from "@northstar/contracts";
import type { UIMessageChunk, UIMessageStreamWriter } from "ai";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type TraceInput = DistributiveOmit<TurnTraceEvent, "at">;

const SECRET_PATTERN = /\bBearer\s+[^\s"']+|\beyJ[\w-]{12,}\.[\w-]{12,}\.[\w-]{8,}/gi;

/** Converts any thrown value into a short, credential-free message that is safe to show. */
export function describeTurnError(error: unknown): string {
  const raw =
    error instanceof Error
      ? `${error.name && error.name !== "Error" ? `${error.name}: ` : ""}${error.message}`
      : typeof error === "string"
        ? error
        : "Unknown error";
  const cleaned = raw.replace(SECRET_PATTERN, "[redacted]").replace(/\s+/g, " ").trim();
  return (cleaned || "Unknown error").slice(0, 240);
}

function isTimeout(reason: string) {
  return /timeout|timed out/i.test(reason);
}

export type TurnRoute = NonNullable<Extract<TurnTraceEvent, { kind: "turn-start" }>["route"]>;

export type TurnTraceOptions = {
  model: string;
  toolCount: number;
  requiredTool?: string;
  route?: TurnRoute;
  timeoutSeconds: number;
  /** The caller's own signal; an abort here means the user stopped the turn. */
  userAbortSignal?: AbortSignal;
  now?: () => number;
};

/**
 * Forwards a model UI stream to the client while recording every lifecycle event
 * (steps, reasoning, text, tool input and output, errors) into one persisted
 * `data-turn-trace` part. Errors, timeouts, and empty completions are converted
 * into an explanatory assistant message so a turn never ends silently.
 */
export function createTurnTracer(writer: UIMessageStreamWriter, options: TurnTraceOptions) {
  const now = options.now ?? Date.now;
  const trace: TurnTrace = { startedAt: now(), events: [] };
  // The trace part is only published once the message `start` chunk has been forwarded.
  let started = false;
  const publish = () => {
    if (started) writer.write({ type: TURN_TRACE_PART_TYPE, id: TURN_TRACE_PART_ID, data: trace });
  };
  const record = (event: TraceInput) => {
    trace.events.push({ ...event, at: now() } as TurnTraceEvent);
    publish();
  };

  record({
    kind: "turn-start",
    model: options.model,
    toolCount: options.toolCount,
    ...(options.requiredTool ? { requiredTool: options.requiredTool } : {}),
    ...(options.route ? { route: options.route } : {}),
  });

  return {
    trace,
    recordStepFinish(step: {
      stepNumber: number;
      finishReason: string;
      usage?: {
        inputTokens?: number;
        outputTokens?: number;
        outputTokenDetails?: { reasoningTokens?: number };
      };
    }) {
      record({
        kind: "step-finish",
        step: step.stepNumber,
        finishReason: step.finishReason,
        ...(step.usage?.inputTokens !== undefined ? { inputTokens: step.usage.inputTokens } : {}),
        ...(step.usage?.outputTokens !== undefined
          ? { outputTokens: step.usage.outputTokens }
          : {}),
        ...(step.usage?.outputTokenDetails?.reasoningTokens !== undefined
          ? { reasoningTokens: step.usage.outputTokenDetails.reasoningTokens }
          : {}),
      });
    },
    async pipe(source: ReadableStream<UIMessageChunk>) {
      let step = -1;
      let reasoningIndex = -1;
      let reasoningChars = 0;
      let textIndex = -1;
      let textChars = 0;
      let visibleChars = 0;
      let completedTools = 0;
      const openReasoning = new Set<string>();
      const openText = new Set<string>();
      const toolNames = new Map<string, string>();
      // The SDK reports an invalid tool call as both an input error and an output error.
      const inputErrors = new Set<string>();
      let heldFinish: UIMessageChunk | undefined;
      let failure: { kind: "error" | "abort"; message: string } | undefined;

      const reader = source.getReader();
      try {
        while (true) {
          let next: ReadableStreamReadResult<UIMessageChunk>;
          try {
            next = await reader.read();
          } catch (error) {
            failure = { kind: "error", message: describeTurnError(error) };
            record({ kind: "error", message: failure.message });
            break;
          }
          if (next.done) break;
          const chunk = next.value;
          switch (chunk.type) {
            case "start":
              writer.write(chunk);
              started = true;
              publish();
              break;
            case "start-step":
              step += 1;
              writer.write(chunk);
              record({ kind: "step-start", step });
              break;
            case "reasoning-start":
              reasoningIndex += 1;
              reasoningChars = 0;
              openReasoning.add(chunk.id);
              writer.write(chunk);
              record({ kind: "reasoning-start", index: reasoningIndex });
              break;
            case "reasoning-delta":
              reasoningChars += chunk.delta.length;
              writer.write(chunk);
              break;
            case "reasoning-end":
              openReasoning.delete(chunk.id);
              writer.write(chunk);
              record({ kind: "reasoning-end", index: reasoningIndex, chars: reasoningChars });
              break;
            case "text-start":
              textIndex += 1;
              textChars = 0;
              openText.add(chunk.id);
              writer.write(chunk);
              record({ kind: "text-start", index: textIndex });
              break;
            case "text-delta":
              textChars += chunk.delta.length;
              visibleChars += chunk.delta.trim().length;
              writer.write(chunk);
              break;
            case "text-end":
              openText.delete(chunk.id);
              writer.write(chunk);
              record({ kind: "text-end", index: textIndex, chars: textChars });
              break;
            case "tool-input-start":
              toolNames.set(chunk.toolCallId, chunk.toolName);
              writer.write(chunk);
              record({
                kind: "tool-input-start",
                toolCallId: chunk.toolCallId,
                toolName: chunk.toolName,
              });
              break;
            case "tool-input-available":
              toolNames.set(chunk.toolCallId, chunk.toolName);
              writer.write(chunk);
              record({
                kind: "tool-input-available",
                toolCallId: chunk.toolCallId,
                toolName: chunk.toolName,
              });
              break;
            case "tool-input-error":
              inputErrors.add(chunk.toolCallId);
              writer.write(chunk);
              record({
                kind: "tool-input-error",
                toolCallId: chunk.toolCallId,
                toolName: chunk.toolName,
                message: describeTurnError(chunk.errorText),
              });
              break;
            case "tool-output-available":
              if (!chunk.preliminary) completedTools += 1;
              writer.write(chunk);
              if (!chunk.preliminary)
                record({ kind: "tool-output-available", toolCallId: chunk.toolCallId });
              break;
            case "tool-output-error":
              writer.write(chunk);
              if (!inputErrors.has(chunk.toolCallId))
                record({
                  kind: "tool-output-error",
                  toolCallId: chunk.toolCallId,
                  message: describeTurnError(chunk.errorText),
                });
              break;
            case "finish":
              heldFinish = chunk;
              break;
            case "abort":
              failure = { kind: "abort", message: chunk.reason ?? "Aborted" };
              record({ kind: "abort", reason: describeTurnError(failure.message) });
              break;
            case "error":
              failure = { kind: "error", message: describeTurnError(chunk.errorText) };
              record({ kind: "error", message: failure.message });
              break;
            default:
              writer.write(chunk);
          }
          if (failure) break;
        }
      } finally {
        reader.releaseLock();
      }
      if (failure) await source.cancel().catch(() => undefined);

      for (const id of openReasoning) writer.write({ type: "reasoning-end", id });
      for (const id of openText) writer.write({ type: "text-end", id });

      if (!started) {
        writer.write({ type: "start" });
        started = true;
      }
      const userStopped = Boolean(options.userAbortSignal?.aborted);
      const timedOut = failure?.kind === "abort" && !userStopped && isTimeout(failure.message);
      const outcome = userStopped
        ? "aborted"
        : timedOut
          ? "timed-out"
          : failure
            ? "failed"
            : "completed";

      if (!userStopped) {
        const notice = fallbackNotice({
          outcome,
          failureMessage: failure?.message,
          hasText: visibleChars > 0,
          completedTools,
          timeoutSeconds: options.timeoutSeconds,
        });
        if (notice) {
          record({ kind: "fallback-text", reason: outcome === "completed" ? "empty" : outcome });
          const id = crypto.randomUUID();
          writer.write({ type: "text-start", id });
          writer.write({ type: "text-delta", id, delta: notice });
          writer.write({ type: "text-end", id });
        }
      }
      record({ kind: "turn-finish", outcome });
      writer.write(heldFinish ?? { type: "finish" });
      return { outcome, trace };
    },
  };
}

export function fallbackNotice({
  outcome,
  failureMessage,
  hasText,
  completedTools,
  timeoutSeconds,
}: {
  outcome: "completed" | "aborted" | "timed-out" | "failed";
  failureMessage?: string;
  hasText: boolean;
  completedTools: number;
  timeoutSeconds: number;
}): string | null {
  const toolNote =
    completedTools > 0
      ? " Salesforce did return a result, which is available in the technical trace below."
      : "";
  const lead = hasText ? "\n\n" : "";
  if (outcome === "timed-out")
    return `${lead}This turn reached the ${timeoutSeconds}-second limit before the orchestrator finished.${toolNote} Retry to continue.`;
  if (outcome === "failed")
    return `${lead}The orchestrator stopped because of an error: ${failureMessage ?? "unknown error"}.${toolNote} Retry when ready.`;
  if (outcome === "completed" && !hasText)
    return completedTools > 0
      ? "Salesforce returned a result, but the model did not write a summary of it. The full result is in the technical trace below. Retry to regenerate the summary."
      : "The model finished without writing a response. Retry the request.";
  return null;
}
