import type { LanguageModelMiddleware } from "ai";

type WrapStream = NonNullable<LanguageModelMiddleware["wrapStream"]>;
type WrapStreamOptions = Parameters<WrapStream>[0];
type StreamResult = Awaited<ReturnType<WrapStreamOptions["doStream"]>>;
type StreamPart = StreamResult["stream"] extends ReadableStream<infer Part> ? Part : never;
type CallParams = WrapStreamOptions["params"];

/** Bounds a forced tool-call step so a degenerate reasoning loop cannot run until the turn times out. */
export const FORCED_TOOL_MAX_OUTPUT_TOKENS = 1024;
const MAX_ATTEMPTS = 2;

function forcedToolName(params: CallParams) {
  const choice = params.toolChoice;
  return choice?.type === "tool" ? choice.toolName : undefined;
}

function requiredKeys(params: CallParams, toolName: string): string[] {
  const tool = params.tools?.find((candidate) => candidate.name === toolName);
  const schema = tool && "inputSchema" in tool ? tool.inputSchema : undefined;
  const required = (schema as { required?: unknown } | undefined)?.required;
  return Array.isArray(required) ? required.filter((key) => typeof key === "string") : [];
}

/**
 * gpt-oss on Workers AI sometimes writes a forced tool call's JSON arguments at the end of its
 * reasoning instead of emitting a structured tool call. Returns those arguments when the
 * reasoning ends with a JSON object that satisfies the tool's required keys.
 */
export function salvageToolInput(reasoning: string, required: string[]): string | null {
  const text = reasoning.trimEnd();
  if (!text.endsWith("}")) return null;
  const starts: number[] = [];
  for (let index = text.indexOf("{"); index >= 0; index = text.indexOf("{", index + 1))
    starts.push(index);
  for (const start of starts.reverse()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text.slice(start));
    } catch {
      // Keep widening the candidate until the braces balance.
      continue;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return required.every((key) => key in parsed) ? JSON.stringify(parsed) : null;
  }
  return null;
}

async function collect(stream: ReadableStream<StreamPart>) {
  const parts: StreamPart[] = [];
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) return parts;
    parts.push(value);
  }
}

function replay(parts: StreamPart[]) {
  return new ReadableStream<StreamPart>({
    start(controller) {
      for (const part of parts) controller.enqueue(part);
      controller.close();
    },
  });
}

/** Rewrites a buffered step whose tool call leaked into reasoning into a structured tool call. */
export function repairForcedToolStep(
  parts: StreamPart[],
  toolName: string,
  required: string[],
): StreamPart[] | null {
  if (parts.some((part) => part.type === "tool-call" || part.type === "error")) return parts;
  const reasoning = parts
    .map((part) => (part.type === "reasoning-delta" ? part.delta : ""))
    .join("");
  const input = salvageToolInput(reasoning, required);
  if (!input) return null;
  const toolCallId = `salvaged-${crypto.randomUUID()}`;
  const finishIndex = parts.findIndex((part) => part.type === "finish");
  const finish = finishIndex >= 0 ? parts[finishIndex] : undefined;
  const body = finishIndex >= 0 ? parts.slice(0, finishIndex) : parts;
  return [
    ...body,
    { type: "tool-input-start", id: toolCallId, toolName },
    { type: "tool-input-delta", id: toolCallId, delta: input },
    { type: "tool-input-end", id: toolCallId },
    { type: "tool-call", toolCallId, toolName, input },
    {
      ...(finish?.type === "finish" ? finish : { type: "finish" as const, usage: emptyUsage() }),
      type: "finish",
      finishReason: { unified: "tool-calls", raw: "salvaged-from-reasoning" },
    } as StreamPart,
  ];
}

function emptyUsage() {
  return {
    inputTokens: {
      total: undefined,
      noCache: undefined,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: { total: undefined, text: undefined, reasoning: undefined },
  };
}

/**
 * Makes forced tool-call steps dependable: caps their output, buffers the short step, recovers a
 * tool call that leaked into reasoning, and retries once when no call can be recovered.
 */
export const forcedToolCallMiddleware: LanguageModelMiddleware = {
  transformParams: async ({ params }) =>
    forcedToolName(params)
      ? {
          ...params,
          maxOutputTokens: Math.min(
            params.maxOutputTokens ?? FORCED_TOOL_MAX_OUTPUT_TOKENS,
            FORCED_TOOL_MAX_OUTPUT_TOKENS,
          ),
        }
      : params,
  wrapStream: async ({ doStream, params }) => {
    const toolName = forcedToolName(params);
    if (!toolName) return doStream();
    const required = requiredKeys(params, toolName);
    let last: { result: StreamResult; parts: StreamPart[] } | undefined;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const result = await doStream();
      const parts = await collect(result.stream);
      const repaired = repairForcedToolStep(parts, toolName, required);
      if (repaired) {
        if (repaired !== parts)
          console.warn(`[orchestrator] recovered ${toolName} call from model reasoning`);
        return { ...result, stream: replay(repaired) };
      }
      console.warn(`[orchestrator] forced ${toolName} call missing on attempt ${attempt}`);
      last = { result, parts };
    }
    if (!last) return doStream();
    return { ...last.result, stream: replay(last.parts) };
  },
};
