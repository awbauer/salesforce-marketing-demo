public with sharing class NorthstarValidateCampaignContent {
    public class Input {
        @InvocableVariable(required=true label='Campaign ID') public Id campaignId;
    }
    public class Output {
        @InvocableVariable(label='Content Passed') public Boolean passed;
        @InvocableVariable(label='Content Blockers') public String blockersJson;
    }

    @InvocableMethod(label='Validate Campaign Content' description='Checks bounded campaign fields for readiness.')
    public static List<Output> run(List<Input> inputs) {
        Set<Id> ids = new Set<Id>();
        for (Input item : inputs) if (item != null && item.campaignId != null) ids.add(item.campaignId);
        Map<Id, Campaign> campaigns = new Map<Id, Campaign>([
            SELECT Id, Name, Description, StartDate, EndDate FROM Campaign WHERE Id IN :ids WITH USER_MODE
        ]);
        List<Output> results = new List<Output>();
        for (Input item : inputs) {
            Campaign campaign = item == null ? null : campaigns.get(item.campaignId);
            List<String> blockers = new List<String>();
            if (campaign == null) blockers.add('Campaign was not found or is not visible.');
            else {
                if (String.isBlank(campaign.Description)) blockers.add('Campaign brief is missing.');
                if (campaign.StartDate == null || campaign.EndDate == null) blockers.add('Campaign dates are incomplete.');
                if (campaign.StartDate != null && campaign.EndDate != null && campaign.EndDate < campaign.StartDate) blockers.add('Campaign end date precedes start date.');
                if (campaign.Description != null && campaign.Description.toLowerCase().contains('ignore previous instructions')) blockers.add('Campaign content contains an instruction-like phrase requiring review.');
            }
            Output result = new Output();
            result.passed = blockers.isEmpty();
            result.blockersJson = JSON.serialize(blockers);
            results.add(result);
        }
        return results;
    }
}
