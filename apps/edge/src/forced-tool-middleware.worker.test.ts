import { describe, expect, it } from "vitest";
import {
  FORCED_TOOL_MAX_OUTPUT_TOKENS,
  forcedToolCallMiddleware,
  repairForcedToolStep,
  salvageToolInput,
} from "./forced-tool-middleware";

type Middleware = typeof forcedToolCallMiddleware;
type WrapOptions = Parameters<NonNullable<Middleware["wrapStream"]>>[0];
const wrapStream = forcedToolCallMiddleware.wrapStream as NonNullable<Middleware["wrapStream"]>;
const transformParams = forcedToolCallMiddleware.transformParams as NonNullable<
  Middleware["transformParams"]
>;
type Params = WrapOptions["params"];
type Result = Awaited<ReturnType<WrapOptions["doStream"]>>;
type Part = Result["stream"] extends ReadableStream<infer P> ? P : never;

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 0, reasoning: 1 },
};
const leaked: Part[] = [
  { type: "stream-start", warnings: [] },
  { type: "reasoning-start", id: "r" },
  {
    type: "reasoning-delta",
    id: "r",
    delta: "We need to call the function salesforce_summarize_campaign.",
  },
  { type: "reasoning-delta", id: "r", delta: '{"message":"Summarize the sample campaign"}' },
  { type: "reasoning-end", id: "r" },
  { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage },
];
const structured: Part[] = [
  { type: "tool-input-start", id: "c", toolName: "salesforce_summarize_campaign" },
  { type: "tool-input-end", id: "c" },
  { type: "tool-call", toolCallId: "c", toolName: "salesforce_summarize_campaign", input: "{}" },
  { type: "finish", finishReason: { unified: "tool-calls", raw: "tool_calls" }, usage },
];
const empty: Part[] = [
  { type: "reasoning-start", id: "r" },
  { type: "reasoning-delta", id: "r", delta: " tool tool tool" },
  { type: "reasoning-end", id: "r" },
  { type: "finish", finishReason: { unified: "length", raw: "length" }, usage },
];

const params = {
  prompt: [],
  toolChoice: { type: "tool", toolName: "salesforce_summarize_campaign" },
  tools: [
    {
      type: "function",
      name: "salesforce_summarize_campaign",
      inputSchema: {
        type: "object",
        properties: { message: { type: "string" } },
        required: ["message"],
      },
    },
  ],
} as unknown as Params;

async function read(stream: ReadableStream<Part>) {
  const parts: Part[] = [];
  const reader = stream.getReader();
  for (let next = await reader.read(); !next.done; next = await reader.read())
    parts.push(next.value);
  return parts;
}

function run(attempts: Part[][], callParams: Params = params) {
  let calls = 0;
  const doStream = async () =>
    ({
      stream: new ReadableStream({
        start(c) {
          for (const p of attempts[calls++] ?? []) c.enqueue(p);
          c.close();
        },
      }),
    }) as Result;
  return wrapStream({
    doStream,
    doGenerate: async () => {
      throw new Error("unused");
    },
    params: callParams,
    model: {} as WrapOptions["model"],
  }).then(async (result) => ({ parts: await read(result.stream), calls: () => calls }));
}

describe("forced tool call middleware", () => {
  it("salvages trailing JSON arguments only when required keys are present", () => {
    expect(salvageToolInput('Call it.{"message":"hi"}\n', ["message"])).toBe('{"message":"hi"}');
    expect(salvageToolInput('Call it.{"other":"hi"}', ["message"])).toBeNull();
    expect(salvageToolInput('An example {"message":"hi"} then more words', ["message"])).toBeNull();
    expect(salvageToolInput('{"a":{"b":1}}', [])).toBe('{"a":{"b":1}}');
    expect(salvageToolInput("no json }", [])).toBeNull();
  });

  it("leaves structured tool calls untouched", () => {
    expect(repairForcedToolStep(structured, "salesforce_summarize_campaign", ["message"])).toBe(
      structured,
    );
  });

  it("turns a tool call leaked into reasoning into a structured call", async () => {
    const { parts, calls } = await run([leaked]);
    expect(calls()).toBe(1);
    const call = parts.find((part) => part.type === "tool-call");
    expect(call).toMatchObject({
      toolName: "salesforce_summarize_campaign",
      input: '{"message":"Summarize the sample campaign"}',
    });
    expect(parts.at(-1)).toMatchObject({ type: "finish", finishReason: { unified: "tool-calls" } });
  });

  it("retries once when no tool call can be recovered", async () => {
    const { parts, calls } = await run([empty, structured]);
    expect(calls()).toBe(2);
    expect(parts).toEqual(structured);
  });

  it("returns the last attempt when every attempt fails", async () => {
    const { parts, calls } = await run([empty, empty, structured]);
    expect(calls()).toBe(2);
    expect(parts).toEqual(empty);
  });

  it("does not buffer or cap steps without a forced tool", async () => {
    const auto = { ...params, toolChoice: { type: "auto" } } as Params;
    const { calls } = await run([empty], auto);
    expect(calls()).toBe(1);
    await expect(
      transformParams({
        params: auto,
        type: "stream",
        model: {} as WrapOptions["model"],
      }),
    ).resolves.toBe(auto);
    await expect(
      transformParams({
        params,
        type: "stream",
        model: {} as WrapOptions["model"],
      }),
    ).resolves.toMatchObject({ maxOutputTokens: FORCED_TOOL_MAX_OUTPUT_TOKENS });
  });
});
