import {
  type Confirmation,
  currentFocusVersion,
  FOCUS_KIND_LABELS,
  type FocusItem,
  type PermissionReport,
  PermissionReportSchema,
  type RecordWrite,
  type WorkingSet,
} from "../../../packages/contracts/src/index.ts";
import { addCreatedRecord } from "./working-set.ts";

/**
 * Turns the focus draft into a Salesforce record write: a campaign, a brief, or an email, push,
 * or SMS message. The server authors every value from the focus, so the confirmation card shows
 * exactly what will be written, and the Apex actions enforce it again in Salesforce.
 */

export type RecordAction = "save-campaign" | "save-brief" | "save-message";

export type PlannedWrite = {
  action: RecordAction;
  /** The confirmation subject: the record updated, its parent campaign, or "new". */
  recordId: string;
  write: RecordWrite;
  summary: string;
};

const OBJECT_LABELS: Record<RecordWrite["objectType"], string> = {
  Campaign: "Campaign",
  Northstar_Brief__c: "Brief",
  Northstar_Message__c: "Message",
};

const clip = (value: string | undefined, max: number) =>
  value === undefined ? undefined : value.length > max ? `${value.slice(0, max - 1)}…` : value;

/** The value of the first field whose label matches, such as Subject or Headline. */
function field(focus: FocusItem, pattern: RegExp) {
  return currentFocusVersion(focus).fields.find((entry) => pattern.test(entry.label))?.value;
}

function channelFor(focus: FocusItem): RecordWrite["channel"] {
  if (focus.kind === "push-message") return "Push";
  if (focus.kind === "email") return "Email";
  const named = field(focus, /^channel$/i) ?? "";
  if (/push|app/i.test(named)) return "Push";
  if (/sms|text/i.test(named)) return "SMS";
  return "Email";
}

/**
 * The campaign a brief or message belongs to: the one it was saved under before, the Salesforce
 * campaign open in the chat when the draft names it (or names none), or a new one the draft
 * names in its Campaign field.
 */
function campaignTarget(focus: FocusItem, set: WorkingSet) {
  if (focus.saved?.campaignId) return { campaignId: focus.saved.campaignId };
  const named = field(focus, /^campaign( name)?$/i)?.trim();
  const open = set.records.find(
    (record) => record.system === "salesforce" && record.objectType === "Campaign",
  );
  if (open && (!named || named.toLowerCase() === open.title.toLowerCase()))
    return { campaignId: open.recordId, campaignTitle: open.title };
  return {
    newCampaignName: clip(named || `${currentFocusVersion(focus).title} campaign`, 80) as string,
    brand: clip(field(focus, /^brand$/i) ?? "Northstar", 80),
  };
}

export function planFocusWrite(focus: FocusItem, set: WorkingSet): PlannedWrite {
  const current = currentFocusVersion(focus);
  const title = clip(current.title, 80) as string;
  const draftFields = JSON.stringify(current.fields);
  const body =
    field(focus, /^(body|message|copy|brief)$/i) ??
    [current.summary, ...current.fields.map((entry) => `${entry.label}: ${entry.value}`)]
      .filter(Boolean)
      .join("\n");
  const kindLabel = FOCUS_KIND_LABELS[focus.kind];
  if (focus.kind === "campaign") {
    const recordId = focus.saved?.objectType === "Campaign" ? focus.saved.recordId : undefined;
    const write: RecordWrite = {
      objectType: "Campaign",
      objectLabel: OBJECT_LABELS.Campaign,
      ...(recordId ? { recordId } : {}),
      brand: clip(field(focus, /^brand$/i) ?? "Northstar", 80),
      title,
      body: clip(body, 32000) as string,
      draftFields,
    };
    return {
      action: "save-campaign",
      recordId: recordId ?? "new",
      write,
      summary: `${recordId ? "Update" : "Create"} the Salesforce campaign "${title}" from version ${current.version} of the draft.`,
    };
  }
  const objectType = focus.kind === "brief" ? "Northstar_Brief__c" : "Northstar_Message__c";
  const recordId = focus.saved?.objectType === objectType ? focus.saved.recordId : undefined;
  const target = recordId ? { campaignId: focus.saved?.campaignId } : campaignTarget(focus, set);
  const write: RecordWrite = {
    objectType,
    objectLabel: OBJECT_LABELS[objectType],
    ...(recordId ? { recordId } : {}),
    ...(target.campaignId ? { campaignId: target.campaignId } : {}),
    ...("newCampaignName" in target && target.newCampaignName
      ? { newCampaignName: target.newCampaignName, brand: target.brand }
      : {}),
    title,
    ...(objectType === "Northstar_Message__c"
      ? {
          channel: channelFor(focus),
          subject: clip(field(focus, /^(subject( line)?|headline|title)$/i), 255),
          preheader: clip(field(focus, /^preheader$/i), 255),
          sendTime: clip(field(focus, /^send time$/i), 120),
        }
      : {
          objective: clip(field(focus, /^(objective|goal)$/i) ?? current.summary, 255),
          channel: undefined,
        }),
    audience: clip(field(focus, /^audience$/i), 255),
    body: clip(body, 32000) as string,
    draftFields,
  };
  const where = recordId
    ? ""
    : write.newCampaignName
      ? ` on a new campaign "${write.newCampaignName}"`
      : ` on the campaign "${"campaignTitle" in target ? target.campaignTitle : write.campaignId}"`;
  return {
    action: objectType === "Northstar_Brief__c" ? "save-brief" : "save-message",
    recordId: recordId ?? write.campaignId ?? "new",
    write,
    summary: `${recordId ? "Update" : "Create"} the ${kindLabel.toLowerCase()} "${title}" in Salesforce${where}, from version ${current.version} of the draft. Nothing is sent or scheduled.`,
  };
}

/** Reads the check_write_access result: allowed, the user, and each check. */
export function parsePermissionReport(output: unknown, at: Date): PermissionReport | null {
  const text =
    typeof output === "object" && output
      ? ((output as { content?: Array<{ text?: string }> }).content ?? [])
          .map((part) => part.text ?? "")
          .join("")
      : "";
  const find = (key: string): unknown => {
    const search = (value: unknown): unknown => {
      if (!value || typeof value !== "object") return undefined;
      if (key in value) return (value as Record<string, unknown>)[key];
      for (const child of Object.values(value)) {
        const found = search(child);
        if (found !== undefined) return found;
      }
      return undefined;
    };
    try {
      return search(output) ?? search(JSON.parse(text));
    } catch {
      return search(output);
    }
  };
  const checksJson = find("checksJson");
  try {
    const checks = typeof checksJson === "string" ? JSON.parse(checksJson) : checksJson;
    return PermissionReportSchema.parse({
      source: "salesforce",
      user: String(find("userName") ?? "Salesforce user"),
      allowed: find("allowed") === true,
      checkedAt: at.toISOString(),
      checks,
    });
  } catch {
    return null;
  }
}

/** Local development's permission report: the same checks, marked as a fixture. */
export function fixturePermissionReport(
  action: Confirmation["action"],
  write: RecordWrite | undefined,
  at: Date,
): PermissionReport {
  const creating = !write?.recordId;
  const objectLabel =
    write?.objectLabel ??
    (action === "create-review-task"
      ? "Task"
      : action === "attach-generated-image"
        ? "Content Version"
        : "Campaign");
  const checks = [
    {
      label: "Workbench permission set",
      detail: "Northstar Marketing Workbench Evaluator is assigned.",
    },
    ...(write?.objectType === "Campaign" ||
    write?.newCampaignName ||
    action === "save-draft-campaign"
      ? [{ label: "Marketing User", detail: "Can create and edit campaigns." }]
      : []),
    {
      label: `${creating && action !== "save-draft-campaign" ? "Create" : "Edit"} ${objectLabel === "Brief" ? "Northstar Brief" : objectLabel === "Message" ? "Northstar Message" : objectLabel}`,
      detail: "Allowed by your profile and permission sets.",
    },
    ...(write?.newCampaignName
      ? [{ label: "Create Campaign", detail: "Allowed by your profile and permission sets." }]
      : []),
    { label: "Field: Body", detail: "Field-level security allows writing it." },
    ...(write?.recordId
      ? [{ label: "Edit this record", detail: "Sharing gives you edit access to the record." }]
      : []),
  ].map((check) => ({ ...check, passed: true }));
  return {
    source: "local-fixture",
    user: "Local evaluator",
    allowed: true,
    checkedAt: at.toISOString(),
    checks,
  };
}

export type RecordWriteResult = {
  recordId: string;
  campaignId?: string;
  created: boolean;
  campaignCreated: boolean;
};

/** The working set after a confirmed record write: its records, and the focus linked to it. */
export function applyRecordWrite(
  set: WorkingSet,
  confirmation: Confirmation,
  result: RecordWriteResult,
  at: Date,
): WorkingSet {
  const write = confirmation.write;
  if (!write) return set;
  const tool =
    confirmation.action === "save-campaign"
      ? "save_campaign"
      : confirmation.action === "save-brief"
        ? "save_brief"
        : "save_message";
  let next = set;
  if (result.campaignCreated && result.campaignId && write.newCampaignName)
    next = addCreatedRecord(
      next,
      {
        system: "salesforce",
        objectType: "Campaign",
        recordId: result.campaignId,
        title: write.newCampaignName,
      },
      tool,
      at,
    );
  next = addCreatedRecord(
    next,
    {
      system: "salesforce",
      objectType: write.objectType,
      recordId: result.recordId,
      title: write.title,
    },
    tool,
    at,
    result.created ? "created" : "updated",
  );
  const focus = next.focus;
  if (focus && confirmation.focus?.id === focus.id)
    next = {
      ...next,
      focus: {
        ...focus,
        saved: {
          objectType: write.objectType,
          recordId: result.recordId,
          version: confirmation.focus.version,
          ...(result.campaignId ? { campaignId: result.campaignId } : {}),
        },
      },
    };
  return next;
}
