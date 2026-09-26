/**
 * Reports, as the signed-in user, whether Salesforce would allow one of the workbench's writes:
 * the Marketing User feature, the workbench permission set, object create or edit access,
 * field edit access, and edit access to the specific record for updates. Read-only; the write
 * actions enforce the same rules again in user mode when they run.
 */
global with sharing class NorthstarCheckWriteAccess {
    global class Input {
        @InvocableVariable(required=true label='Action' description='save-campaign, save-brief, save-message, create-review-task, save-draft-campaign, or attach-generated-image.') global String action;
        @InvocableVariable(label='Record ID' description='Record to be updated, if the write updates one.') global Id recordId;
        @InvocableVariable(label='Creates Campaign' description='True when the write also creates a new campaign.') global Boolean createsCampaign;
    }
    global class Output {
        @InvocableVariable(label='Allowed' description='True only when every check passed.') global Boolean allowed;
        @InvocableVariable(label='User' description='The Salesforce user the checks ran as.') global String userName;
        @InvocableVariable(label='Checks' description='Each check as JSON: label, passed, and detail.') global String checksJson;
    }

    private class Check {
        String label;
        Boolean passed;
        String detail;
        Check(String label, Boolean passed, String detail) {
            this.label = label;
            this.passed = passed;
            this.detail = detail;
        }
    }

    private static final Map<String, List<String>> CREATES = new Map<String, List<String>>{
        'save-campaign' => new List<String>{ 'Campaign' },
        'save-brief' => new List<String>{ 'Northstar_Brief__c' },
        'save-message' => new List<String>{ 'Northstar_Message__c' },
        'create-review-task' => new List<String>{ 'Task' },
        'attach-generated-image' => new List<String>{ 'ContentVersion' },
        'save-draft-campaign' => new List<String>()
    };
    private static final Map<String, List<String>> FIELDS = new Map<String, List<String>>{
        'save-campaign' => new List<String>{ 'Campaign.Description', 'Campaign.Northstar_Brand__c' },
        'save-brief' => new List<String>{ 'Northstar_Brief__c.Body__c', 'Northstar_Brief__c.Campaign__c' },
        'save-message' => new List<String>{ 'Northstar_Message__c.Body__c', 'Northstar_Message__c.Campaign__c' },
        'create-review-task' => new List<String>{ 'Task.Description' },
        'attach-generated-image' => new List<String>{ 'ContentVersion.Title' },
        'save-draft-campaign' => new List<String>{ 'Campaign.Description' }
    };

    @InvocableMethod(label='Check Write Access' description='Reports whether the signed-in user may perform one workbench write. Read-only.')
    global static List<Output> run(List<Input> inputs) {
        List<Output> results = new List<Output>();
        User user = [SELECT Name, UserPermissionsMarketingUser FROM User WHERE Id = :UserInfo.getUserId()];
        Boolean hasPermissionSet = [
            SELECT COUNT() FROM PermissionSetAssignment
            WHERE AssigneeId = :UserInfo.getUserId()
            AND PermissionSet.Name = 'Northstar_Marketing_Workbench_Evaluator'
        ] > 0;
        for (Input item : inputs) {
            List<Check> checks = new List<Check>();
            String action = item == null ? null : item.action;
            if (action == null || !CREATES.containsKey(action)) {
                checks.add(new Check('Known action', false, 'This action is not one the workbench may perform.'));
            } else {
                checks.add(new Check('Workbench permission set', hasPermissionSet,
                    hasPermissionSet ? 'Northstar Marketing Workbench Evaluator is assigned.' : 'The workbench permission set is not assigned.'));
                List<String> objects = new List<String>(CREATES.get(action));
                if (item.createsCampaign == true && !objects.contains('Campaign')) objects.add('Campaign');
                if (objects.contains('Campaign') || action == 'save-draft-campaign') {
                    checks.add(new Check('Marketing User', user.UserPermissionsMarketingUser,
                        user.UserPermissionsMarketingUser ? 'Can create and edit campaigns.' : 'Campaign writes need the Marketing User feature.'));
                }
                for (String name : objects) {
                    Schema.DescribeSObjectResult type = Schema.getGlobalDescribe().get(name).getDescribe();
                    Boolean creating = item.recordId == null || name != String.valueOf(item.recordId.getSObjectType());
                    Boolean ok = creating ? type.isCreateable() : type.isUpdateable();
                    checks.add(new Check((creating ? 'Create ' : 'Edit ') + type.getLabel(), ok,
                        ok ? 'Allowed by your profile and permission sets.' : 'Not allowed for your user.'));
                }
                if (action == 'save-draft-campaign') {
                    Boolean ok = Schema.sObjectType.Campaign.isUpdateable();
                    checks.add(new Check('Edit Campaign', ok, ok ? 'Allowed by your profile and permission sets.' : 'Not allowed for your user.'));
                }
                for (String field : FIELDS.get(action)) {
                    List<String> parts = field.split('\\.');
                    Schema.DescribeFieldResult describe = Schema.getGlobalDescribe().get(parts[0])
                        .getDescribe().fields.getMap().get(parts[1]).getDescribe();
                    Boolean ok = describe.isUpdateable() || describe.isCreateable();
                    checks.add(new Check('Field: ' + describe.getLabel(), ok,
                        ok ? 'Field-level security allows writing it.' : 'Field-level security blocks it.'));
                }
                if (item.recordId != null) {
                    List<UserRecordAccess> access = [
                        SELECT RecordId, HasEditAccess FROM UserRecordAccess
                        WHERE UserId = :UserInfo.getUserId() AND RecordId = :item.recordId
                    ];
                    Boolean ok = !access.isEmpty() && access[0].HasEditAccess;
                    checks.add(new Check('Edit this record', ok,
                        ok ? 'Sharing gives you edit access to the record.' : 'Sharing does not give you edit access.'));
                }
            }
            Boolean allowed = true;
            for (Check check : checks) allowed = allowed && check.passed;
            Output result = new Output();
            result.allowed = allowed;
            result.userName = user.Name;
            result.checksJson = JSON.serialize(checks);
            results.add(result);
        }
        return results;
    }
}
