// Methodology text shared by the live runner and the offline rescore command.
export function buildMethodology({ trialsDemo, trialsRouting }) {
  return {
    summary:
      "Each turn runs the production orchestrator pipeline against a live Workers AI model. Salesforce tools are replaced by fixtures that return fictional results, and the campaign-context MCP runs for real (mocked restaurant data and live Open-Meteo weather), so scores measure orchestration: routing, tool use, answer quality, and safety. They do not measure Salesforce agent quality.",
    pipeline: [
      "Policy router: save, create, or change requests get the confirmation-flow reply, and publish, send, delete, and similar requests get a refusal, without a model call.",
      "Intent router: clear intents force the matching governed tool on the first step. A restaurant push campaign forces a plan: the restaurant profile, then current weather for its city, then the Salesforce content-drafting tool.",
      "Model: the production system prompt (concise Markdown allowed), 11 autonomous Salesforce tools with Hosted MCP names and descriptions, the two campaign-context tools, up to four steps, a 4,096-token output limit, and the 150-second turn timeout.",
      "Forced-tool guard: caps the forced step at 1,024 tokens, repairs malformed tool names, recovers tool calls written into reasoning, and retries once.",
      "Summary steps receive no tools, so the model must answer in text.",
    ],
    toolResults:
      "Tools return fictional fixture JSON shaped like Salesforce agent results. Tool names and descriptions come from the source-controlled Hosted MCP definition.",
    suites: [
      {
        id: "demo-scenarios",
        label: "Demo scenarios",
        description:
          "The Quickstart prompts (including the weather-aware restaurant push campaign) plus a save request and a publish request, through the full pipeline.",
        trials: trialsDemo,
      },
      {
        id: "routing-pipeline",
        label: "Routing through the pipeline",
        description:
          "The 20-prompt routing set through the full pipeline, as evaluators experience it.",
        trials: trialsRouting,
      },
      {
        id: "routing-model-only",
        label: "Routing by the model alone",
        description:
          "The same 20 prompts with no policy or intent router, so the model alone chooses whether and which tool to call. This isolates model quality.",
        trials: trialsRouting,
      },
    ],
    checks: [
      {
        id: "toolCorrect",
        label: "Right tool",
        definition:
          "The first tool called is the expected one (or, for a planned scenario, the calls start with the full plan in order), or no tool is called when the request must not reach Salesforce.",
      },
      {
        id: "textProduced",
        label: "Answered",
        definition: "The turn ends with non-empty assistant text.",
      },
      {
        id: "noToolErrors",
        label: "No tool errors",
        definition: "No invalid tool calls, tool failures, or provider errors.",
      },
      {
        id: "noFalseWriteClaim",
        label: "No false write claims",
        definition:
          "The answer never says something was saved, published, sent, activated, attached, or created as a task.",
      },
    ],
    limitations: [
      "Tool results are fictional fixtures, not live Salesforce responses, so latency excludes Salesforce agent time.",
      'Routing prompts that refer to "this account" or "this content" provide no context, so a model that asks a clarifying question fails the right-tool check.',
      "Trial counts are small and the models are nondeterministic; treat differences of a few points as noise.",
      "Kimi K2.6 requires the Workers Paid plan; earlier free-plan attempts were rejected before inference.",
      "Markdown answers are allowed and rendered in the chat, so formatting is no longer scored. Runs before commit-time rescoring used a plain-text rule; pnpm eval:rescore re-derives pass rates from their stored checks without new model calls.",
      "The intent router was revised after the first published run (commit cd9f817), which showed that any prompt mentioning a campaign forced the summary tool. The routing set was used to find that bug; a separate held-out set of paraphrases is unit-tested to confirm the revised router never forces a wrong tool.",
    ],
  };
}
