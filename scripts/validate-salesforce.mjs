import { spawnSync } from "node:child_process";
import { report } from "./lib/report.mjs";

const targetOrg = process.env.SF_TARGET_ORG?.trim();
const approvedProofOrgId = process.env.SF_APPROVED_PROOF_ORG_ID?.trim();
const checks = [];
const failures = [];
const observations = {};

function sf(args, label) {
  const result = spawnSync("sf", [...args, "--json", "--target-org", targetOrg], {
    encoding: "utf8",
    env: { ...process.env, SF_DISABLE_TELEMETRY: "true" },
  });
  let parsed;
  try {
    parsed = JSON.parse(result.stdout || "{}");
  } catch {
    parsed = {};
  }
  const passed = result.status === 0 && parsed.status === 0;
  checks.push({ label, passed });
  if (!passed) failures.push(`${label} failed; inspect the Salesforce CLI locally for details.`);
  return parsed.result;
}

if (!targetOrg) {
  failures.push(
    "SF_TARGET_ORG must identify the supplied Northstar Salesforce sandbox explicitly.",
  );
} else {
  const org = sf(["org", "display"], "authorized org");
  if (org?.apiVersion && Number.parseFloat(org.apiVersion) < 67)
    failures.push("The target org API version is below 67.0.");
  const organization = sf(
    [
      "data",
      "query",
      "--query",
      "SELECT Id, IsSandbox, OrganizationType FROM Organization LIMIT 1",
    ],
    "organization classification query",
  );
  const organizationRecord = organization?.records?.[0];
  const isSandbox = organizationRecord?.IsSandbox === true;
  const isApprovedProofOrg =
    targetOrg === "northstar-pot" &&
    Boolean(approvedProofOrgId) &&
    approvedProofOrgId === organizationRecord?.Id;
  checks.push({
    label: "sandbox or exact approved proof-org classification",
    passed: isSandbox || isApprovedProofOrg,
  });
  if (!isSandbox && !isApprovedProofOrg) {
    failures.push(
      "SF_TARGET_ORG is not a sandbox or the exact user-approved proof org; Phase 2 forbids business-data checks or deployment.",
    );
  } else {
    const campaigns = sf(
      ["data", "query", "--query", "SELECT Id, Name, Status FROM Campaign LIMIT 1"],
      "representative Campaign record",
    );
    const accounts = sf(
      ["data", "query", "--query", "SELECT Id, Name FROM Account LIMIT 1"],
      "representative Account record",
    );
    const businessUnits = sf(
      [
        "data",
        "query",
        "--query",
        "SELECT Id, DeveloperName, MasterLabel, Status, DataSpaceId FROM BusinessUnit",
      ],
      "Marketing Cloud business unit access",
    );
    const dataSpaces = sf(
      [
        "data",
        "query",
        "--query",
        "SELECT Id, Name, DataSpaceApiName, Status, IsLocked FROM DataSpace",
      ],
      "Data 360 data space access",
    );
    const consentObjects = [
      "ContactPointTypeConsent",
      "ContactPointConsent",
      "CommSubscriptionConsent",
      "PartyConsent",
      "ssot__CommunicationSubscriptionConsent__dlm",
    ];
    let consentRecords = 0;
    for (const object of consentObjects) {
      const result = sf(
        ["data", "query", "--query", `SELECT COUNT(Id) recordCount FROM ${object}`],
        `${object} aggregate access`,
      );
      consentRecords += result?.records?.[0]?.recordCount ?? 0;
    }
    const identity = sf(
      ["data", "query", "--query", "SELECT COUNT(Id) recordCount FROM IndividualIdentityLink__dlm"],
      "Data 360 identity-link aggregate access",
    );
    sf(
      ["org", "list", "metadata", "--metadata-type", "AiAuthoringBundle"],
      "Agent Script metadata availability",
    );
    observations.campaigns = campaigns?.totalSize ?? 0;
    observations.accounts = accounts?.totalSize ?? 0;
    observations.activeBusinessUnits =
      businessUnits?.records?.filter((record) => record.Status === "Active").length ?? 0;
    observations.activeDataSpaces =
      dataSpaces?.records?.filter((record) => record.Status === "ACTIVE").length ?? 0;
    observations.consentRecords = consentRecords;
    observations.identityLinks = identity?.records?.[0]?.recordCount ?? 0;
    for (const [label, passed, failure] of [
      [
        "active Marketing Cloud business unit",
        observations.activeBusinessUnits > 0,
        "No active Marketing Cloud business unit was found.",
      ],
      [
        "active Data 360 data space",
        observations.activeDataSpaces > 0,
        "No active Data 360 data space was found.",
      ],
      [
        "representative consent data",
        observations.consentRecords > 0,
        "Consent capability is accessible, but the checked consent stores contain no representative records.",
      ],
      [
        "representative identity-link data",
        observations.identityLinks > 0,
        "No representative Data 360 identity-link records were found.",
      ],
    ]) {
      checks.push({ label, passed });
      if (!passed) failures.push(failure);
    }
  }
}

await report("salesforce-validation", {
  status: failures.length ? "blocked" : "passed",
  targetProvided: Boolean(targetOrg),
  exactProofOrgApprovalProvided: Boolean(approvedProofOrgId),
  sandboxRequired: true,
  apiVersionRequired: "67.0",
  observations,
  checks,
  failures,
});
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`Salesforce sandbox validation passed (${checks.length} checks).`);
