/**
 * How a turn's cost reads next to its time: model tokens (input plus output) and the tools it
 * called, such as "9.0s · 1,204 tokens · 2 tool calls". Shared so every place that shows a turn's
 * seconds shows the same figures the same way.
 */

const count = (value: number, noun: string) =>
  `${value.toLocaleString()} ${noun}${value === 1 ? "" : "s"}`;

export const tokensLabel = (tokens: number) => count(tokens, "token");
export const toolCallsLabel = (toolCalls: number) => count(toolCalls, "tool call");

/** Tool calls in a "a → b → c" plan or tool list; none for a turn that called no tool. */
export const toolCallCount = (toolCalled: string | null | undefined) =>
  toolCalled ? toolCalled.split(" → ").length : 0;

/** "<seconds> · N tokens · N tool calls" */
export function turnStats(
  seconds: string,
  { tokens, toolCalls }: { tokens: number; toolCalls: number },
) {
  return [seconds, tokensLabel(tokens), toolCallsLabel(toolCalls)].join(" · ");
}
