# ADR-004: Use gpt-oss-120b as the orchestrator model

Status: superseded by ADR-005

Date: 2026-09-25

## Context

Section 17 item 5 chose Cloudflare-hosted `@cf/openai/gpt-oss-20b`. WU-016 and WU-017 added guards for its tool-calling failures: tool calls written into reasoning, leaked channel markup in tool names, ignored `toolChoice: "none"`, and summaries cut off by the 256-token default. With those guards in place, a live comparison on Workers AI still found gpt-oss-20b unreliable outside the summarize prompt. Andrew Bauer approved changing the model on 2026-09-25 (WU-018).

Live results used the production pipeline with a stand-in tool result, 20 turns per cell across the four quickstart prompts:

| Model | Forced tool path: turns that worked | Model-selected tool: right tool / worked | Median latency |
|---|---|---|---|
| gpt-oss-20b | 10–12 of 20 | 12 / 11 of 20 | ~5 s |
| gpt-oss-120b | 20 of 20 | 17 / 17 of 20 | ~8–10 s |
| glm-4.7-flash | 20 of 20 | 20 / 19 of 20 | ~10–12 s (slow runs 22–31 s) |
| kimi-k2.6 | errored on every call | — | — |
| llama-4-scout-17b | picked the right tool, never wrote a summary | — | — |

The 20-prompt routing set (`packages/evals/src/cases.ts`), run live with the model selecting among the 11 autonomous tools, 3 runs each: gpt-oss-120b 43 of 60 (72%), gpt-oss-20b 40 of 60 (67%). Most misses on both models were the model asking for context that the prompt refers to but does not provide.

## Decision

Use `@cf/openai/gpt-oss-120b`. It keeps the proof on Workers AI and AI Gateway with no new provider or credential, and it uses the same response format as gpt-oss-20b, so the WU-016 and WU-017 guards still apply. `PROOF_DEFAULTS.orchestratorModel` is the only place the model is set. The Worker reads it directly, and the `ORCHESTRATOR_MODEL` Worker variable is removed.

## Consequences

- Forced tool turns become reliable. Median turn latency roughly doubles, to about 8–10 seconds.
- gpt-oss-120b uses Markdown more often. The existing `normalizeAssistantText` cleanup strips it for display.
- The per-token price is higher. At proof volume (a few thousand tokens per turn) it stays well inside the spend cap.
- Model-selected routing is still below the 90% Section 16 target on the live set. The deterministic intent router and prompt context remain required.
- The tool-name repair now also restores a dropped MCP namespace prefix when exactly one offered tool matches.
- `scripts/check-invariants.mjs` fails if the model is set in `wrangler.jsonc` again.

## Supersedes

Section 17 item 5's choice of `@cf/openai/gpt-oss-20b`.
