/**
 * Read-back for work the Marketing Cloud Next Campaign Creation agent did: a Brief with its
 * campaign preview steps, and the Campaign and campaign flow created from it. Read-only. Sharing
 * applies (with sharing), object access is checked, and fields the user can't read are
 * stripped; USER_MODE isn't used because the Brief entity doesn't support it in every context.
 * The workbench uses it to confirm what the agent created instead of trusting the agent's reply.
 */
global with sharing class WorkbenchGetMarketingRecords {
    global class Input {
        @InvocableVariable(label='Brief ID' description='The Brief to read, with its preview steps and campaign.') global Id briefId;
        @InvocableVariable(label='Brief Name' description='Used only when no Brief ID is given: the newest Brief you created with this exact name.') global String briefName;
    }
    global class Output {
        @InvocableVariable(label='Found' description='True when the Brief exists and you can read it.') global Boolean found;
        @InvocableVariable(label='Read Back' description='Always true: the values come from Salesforce, not from an agent reply.') global Boolean readBack;
        @InvocableVariable(label='Records' description='JSON: brief, steps, campaign, and flow.') global String recordsJson;
    }

    @InvocableMethod(label='Get Marketing Records' description='Reads a Marketing Cloud Next Brief, its campaign preview steps, and the Campaign and campaign flow created from it. Read-only.')
    global static List<Output> run(List<Input> inputs) {
        List<Output> results = new List<Output>();
        for (Input item : inputs) results.add(read(item));
        return results;
    }

    private static List<SObject> readable(List<SObject> rows) {
        return Security.stripInaccessible(AccessType.READABLE, rows).getRecords();
    }

    private static Output read(Input item) {
        Output result = new Output();
        result.readBack = true;
        result.found = false;
        if (!Schema.sObjectType.Brief.isAccessible()) {
            result.recordsJson = JSON.serialize(new Map<String, Object>{ 'brief' => null });
            return result;
        }
        List<Brief> briefs;
        if (item != null && item.briefId != null) {
            briefs = [
                SELECT Id, Name, Description, KeyMessage, TargetAudience, PrimaryGoal, PrimaryKpi,
                    PrimaryCtas, AgentGuardrails, Priority, CreatedDate
                FROM Brief WHERE Id = :item.briefId LIMIT 1
            ];
        } else if (item != null && String.isNotBlank(item.briefName)) {
            Id me = UserInfo.getUserId();
            briefs = [
                SELECT Id, Name, Description, KeyMessage, TargetAudience, PrimaryGoal, PrimaryKpi,
                    PrimaryCtas, AgentGuardrails, Priority, CreatedDate
                FROM Brief WHERE Name = :item.briefName AND CreatedById = :me
                ORDER BY CreatedDate DESC LIMIT 1
            ];
        } else {
            briefs = new List<Brief>();
        }
        briefs = (List<Brief>) readable(briefs);
        if (briefs.isEmpty()) {
            result.recordsJson = JSON.serialize(new Map<String, Object>{ 'brief' => null });
            return result;
        }
        Brief brief = briefs[0];
        List<Map<String, Object>> steps = new List<Map<String, Object>>();
        for (BriefPlanStep step : (List<BriefPlanStep>) readable([
            SELECT StepNumber, StepType, Channel, WaitNumber, WaitUnit, Content
            FROM BriefPlanStep WHERE BriefId = :brief.Id ORDER BY StepNumber
        ])) {
            steps.add(new Map<String, Object>{
                'stepNumber' => step.StepNumber,
                'stepType' => step.StepType,
                'channel' => step.Channel,
                'waitNumber' => step.WaitNumber,
                'waitUnit' => step.WaitUnit,
                'content' => step.Content
            });
        }
        Map<String, Object> campaign = null;
        Map<String, Object> flow = null;
        List<Campaign> campaigns = [
            SELECT Id, Name, Stage, Status, StartDate, EndDate FROM Campaign
            WHERE BriefId = :brief.Id WITH USER_MODE ORDER BY CreatedDate DESC LIMIT 1
        ];
        if (!campaigns.isEmpty()) {
            Campaign record = campaigns[0];
            campaign = new Map<String, Object>{
                'id' => record.Id,
                'name' => record.Name,
                'stage' => record.Stage,
                'status' => record.Status
            };
            // Marketing Cloud Next names a campaign's flow after the campaign id.
            String prefix = 'flow_' + String.valueOf(record.Id) + '%';
            List<FlowDefinitionView> flows = [
                SELECT ApiName, Label, ProcessType, ActiveVersionId, LatestVersionId
                FROM FlowDefinitionView WHERE ApiName LIKE :prefix LIMIT 1
            ];
            if (!flows.isEmpty()) {
                flow = new Map<String, Object>{
                    'apiName' => flows[0].ApiName,
                    'label' => flows[0].Label,
                    'processType' => flows[0].ProcessType,
                    'active' => flows[0].ActiveVersionId != null,
                    'versionId' => flows[0].LatestVersionId
                };
            }
        }
        result.found = true;
        result.recordsJson = JSON.serialize(new Map<String, Object>{
            'brief' => new Map<String, Object>{
                'id' => brief.Id,
                'name' => brief.Name,
                'description' => brief.Description,
                'keyMessage' => brief.KeyMessage,
                'targetAudience' => brief.TargetAudience,
                'primaryGoal' => brief.PrimaryGoal,
                'primaryKpi' => brief.PrimaryKpi,
                'primaryCtas' => brief.PrimaryCtas,
                'agentGuardrails' => brief.AgentGuardrails,
                'priority' => brief.Priority,
                'createdDate' => brief.CreatedDate
            },
            'steps' => steps,
            'campaign' => campaign,
            'flow' => flow
        });
        return result;
    }
}
