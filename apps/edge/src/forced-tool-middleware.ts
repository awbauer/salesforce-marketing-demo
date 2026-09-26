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

/**
 * gpt-oss sometimes leaks its channel markup into a tool name, such as
 * `summarize_campaign<|channel|>analysis`, or drops part of the MCP namespace prefix, such as
 * `recommend_buyer_group` for `tool_salesforce_…_recommend_buyer_group`. Returns the single
 * offered tool name the call was meant for, or the original name when it is ambiguous.
 */
export function normalizeToolName(name: string, offered: ReadonlySet<string>) {
  if (offered.has(name)) return name;
  const stripped = name.split("<|")[0]?.trim() ?? name;
  if (!stripped) return name;
  if (offered.has(stripped)) return stripped;
  const matches = [...offered].filter((candidate) => candidate.endsWith(`_${stripped}`));
  return matches.length === 1 ? (matches[0] as string) : name;
}

function nameNormalizer(params: CallParams) {
  const offered = new Set((params.tools ?? []).map((tool) => tool.name));
  return (part: StreamPart): StreamPart => {
    if (part.type !== "tool-input-start" && part.type !== "tool-call") return part;
    const toolName = normalizeToolName(part.toolName, offered);
    if (toolName === part.toolName) return part;
    console.warn("[orchestrator] repaired a malformed tool name from the model");
    return { ...part, toolName };
  };
}

const LIVE_PART_TYPES = new Set(["reasoning-start", "reasoning-delta", "reasoning-end"]);

/**
 * Completes a forced tool-call step from the parts held back while its reasoning streamed live.
 * Returns the held parts unchanged when they already contain a tool call or an error, a repaired
 * sequence when the call leaked into reasoning, or null when nothing can be recovered.
 */
export function repairForcedToolStep(
  held: StreamPart[],
  reasoning: string,
  toolName: string,
  required: string[],
): StreamPart[] | null {
  if (held.some((part) => part.type === "error")) return held;
  const calls = held.filter((part) => part.type === "tool-call");
  if (calls.length > 0 && calls.every((part) => part.toolName === toolName)) return held;
  // Drop calls to any other tool; the step must call the forced tool or be recovered/retried.
  const wrongIds = new Set(
    held.flatMap((part) =>
      part.type === "tool-call"
        ? [part.toolCallId]
        : part.type === "tool-input-start" && part.toolName !== toolName
          ? [part.id]
          : [],
    ),
  );
  held = held.filter((part) =>
    part.type === "tool-call"
      ? false
      : part.type === "tool-input-start" ||
          part.type === "tool-input-delta" ||
          part.type === "tool-input-end"
        ? !wrongIds.has(part.id)
        : true,
  );
  // gpt-oss usually leaks the arguments into reasoning, and sometimes into the answer text.
  const text = held.map((part) => (part.type === "text-delta" ? part.delta : "")).join("");
  const fromText = salvageToolInput(text.trim(), required);
  const input = salvageToolInput(reasoning, required) ?? fromText;
  if (!input) return null;
  // Leaked JSON answer text must not reach the user as if it were a reply.
  if (fromText === input)
    held = held.filter(
      (part) =>
        part.type !== "text-start" && part.type !== "text-delta" && part.type !== "text-end",
    );
  const toolCallId = `salvaged-${crypto.randomUUID()}`;
  const finishIndex = held.findIndex((part) => part.type === "finish");
  const finish = finishIndex >= 0 ? held[finishIndex] : undefined;
  const body = finishIndex >= 0 ? held.slice(0, finishIndex) : held;
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
 * Makes forced tool-call steps dependable: caps their output, streams reasoning live while
 * holding back the rest of the step, recovers a tool call that leaked into reasoning, and
 * retries once when no call can be recovered.
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
    const normalize = nameNormalizer(params);
    if (!toolName) {
      const result = await doStream();
      return {
        ...result,
        stream: result.stream.pipeThrough(
          new TransformStream<StreamPart, StreamPart>({
            transform(part, controller) {
              controller.enqueue(normalize(part));
            },
          }),
        ),
      };
    }
    const required = requiredKeys(params, toolName);
    const first = await doStream();
    const stream = new ReadableStream<StreamPart>({
      async start(controller) {
        try {
          let result = first;
          for (let attempt = 1; ; attempt += 1) {
            const held: StreamPart[] = [];
            let reasoning = "";
            const reader = result.stream.getReader();
            for (let next = await reader.read(); !next.done; next = await reader.read()) {
              const part = normalize(next.value);
              if (part.type === "reasoning-delta") reasoning += part.delta;
              if (LIVE_PART_TYPES.has(part.type) || (attempt === 1 && part.type === "stream-start"))
                controller.enqueue(part);
              else if (part.type !== "stream-start") held.push(part);
            }
            const repaired = repairForcedToolStep(held, reasoning, toolName, required);
            if (repaired && repaired !== held)
              console.warn(`[orchestrator] recovered ${toolName} call from model reasoning`);
            if (repaired || attempt >= MAX_ATTEMPTS) {
              if (!repaired)
                console.warn(
                  `[orchestrator] forced ${toolName} call missing after ${attempt} attempts`,
                );
              for (const part of repaired ?? held) controller.enqueue(part);
              controller.close();
              return;
            }
            console.warn(
              `[orchestrator] forced ${toolName} call missing on attempt ${attempt}; retrying`,
            );
            result = await doStream();
          }
        } catch (error) {
          controller.error(error);
        }
      },
    });
    return { ...first, stream };
  },
};
