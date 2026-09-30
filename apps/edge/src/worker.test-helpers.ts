import { env, runInDurableObject } from "cloudflare:test";
import { DEFAULTS } from "@workbench/contracts";
import { getAgentByName } from "agents";
import { deriveAgentKey } from "./auth";
import { INSTANCE_PROFILE } from "./generated/profile";

export const CATALOG_CAMPAIGN_ID = "701jV000004GglIQAS";

/** A user's agent stub, addressed exactly as the Worker router does after authentication. */
export async function agentStubFor(subject = "local-evaluator") {
  const name = await deriveAgentKey(
    {
      subject,
      email:
        subject === "local-evaluator"
          ? "evaluator@workbench.example"
          : `${subject}@workbench.example`,
      role: "evaluator",
      tenantId: "workbench-pot",
    },
    INSTANCE_PROFILE.instance.id,
  );
  return getAgentByName(env.MarketingOrchestrator, name, {
    props: { principalSubject: subject, workspaceId: INSTANCE_PROFILE.instance.id },
  });
}

/**
 * Opens the catalog campaign in a user's working set through the real ingestion path, as a
 * Salesforce summary tool result would during a chat.
 */
export async function openCatalogCampaign(subject = "local-evaluator") {
  const stub = await agentStubFor(subject);
  await runInDurableObject(stub, (instance) => {
    (
      instance as unknown as {
        ingestToolResult: (name: string, input: unknown, output: unknown) => void;
      }
    ).ingestToolResult(
      "tool_salesforce_workbench-marketing-salesforce_summarize_campaign",
      { message: `Summarize campaign ${CATALOG_CAMPAIGN_ID}` },
      { content: [{ type: "text", text: "Fall Loyalty Reactivation is in progress." }] },
    );
  });
  return stub;
}
