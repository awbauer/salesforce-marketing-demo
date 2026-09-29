// A fixed stand-in for the Marketing Cloud Campaign Creation agent, used only by evaluations.
// The real agent runs in Salesforce and its output does not depend on the orchestrator model, so
// every contestant would otherwise receive the same static copy and quality could not vary. Here a
// single reference model turns the orchestrator's request into a brief or copy, so what differs
// between contestants is what they asked for and how they present the result.
import { generateText } from "ai";
import { turnCost } from "../../packages/evals/src/pricing.ts";

export const SIMULATOR_MODEL = "@cf/openai/gpt-oss-120b";

const BRIEF_FIELDS =
  "name, description, keyMessage, targetAudience, primaryGoal, primaryCTAs, primaryKPI, agentGuardrails, priority";

// One pinned instruction per simulated tool, mirroring the shape the real agent returns.
const INSTRUCTIONS = {
  draft_campaign_brief: `You are the Marketing Cloud Next Campaign Creation agent running its Draft a Campaign Brief action. Write a complete campaign brief from the request, using only facts the request states. Return one JSON object with exactly these string fields: ${BRIEF_FIELDS}. keyMessage is the single customer-facing message, one or two short sentences.`,
  draft_campaign_content: `You are the Marketing Cloud Next content agent drafting campaign copy from the request, using only facts the request states. Return one JSON object with string fields subjectLine, preheader, body, and callToAction. Keep subjectLine under 60 characters.`,
  create_content_section: `You are the Marketing Cloud Next content agent drafting one email section from the request. Return one JSON object with a string field section.`,
  refine_campaign_preview: `You are the Marketing Cloud Next Campaign Creation agent running its Refine Campaign Preview action. Apply the requested change. Return one JSON object with a string field preview describing the revised preview steps.`,
};

export const SIMULATED_TOOLS = Object.keys(INSTRUCTIONS);

/**
 * Builds the simulator. Results are cached by tool and request, so a repeated identical request
 * costs nothing and every contestant that asks the same thing gets the same answer.
 */
export function createSimulatedAgent(provider) {
  const cache = new Map();
  const usage = { calls: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 };
  async function run(toolName, message) {
    const key = `${toolName}\u0000${message}`;
    if (!cache.has(key))
      cache.set(
        key,
        generateText({
          model: provider(SIMULATOR_MODEL),
          system: INSTRUCTIONS[toolName],
          prompt: message,
          temperature: 0,
          maxOutputTokens: 1200,
        }).then((result) => {
          usage.calls++;
          usage.inputTokens += result.usage.inputTokens ?? 0;
          usage.outputTokens += result.usage.outputTokens ?? 0;
          usage.cachedInputTokens += result.usage.inputTokenDetails?.cacheReadTokens ?? 0;
          return result.text.trim();
        }),
      );
    return cache.get(key);
  }
  return {
    run,
    usage,
    cost: () => turnCost(SIMULATOR_MODEL, usage),
  };
}

/** The tool result the orchestrator sees: the simulator's JSON, or a plain error the model must report. */
export async function simulatedResult(agent, toolName, message) {
  try {
    const text = await agent.run(toolName, message);
    const json = text.match(/\{[\s\S]*\}/)?.[0] ?? text;
    let body;
    try {
      body = JSON.parse(json);
    } catch {
      body = { text };
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ source: "simulated-marketing-cloud-agent", ...body }),
        },
      ],
      isError: false,
    };
  } catch (error) {
    return {
      content: [
        { type: "text", text: `The simulated agent failed: ${String(error).slice(0, 120)}` },
      ],
      isError: true,
    };
  }
}
