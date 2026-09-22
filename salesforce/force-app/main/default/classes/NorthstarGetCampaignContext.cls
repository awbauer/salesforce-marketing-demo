public with sharing class NorthstarGetCampaignContext {
    public class Input {
        @InvocableVariable(required=true label='Campaign ID')
        public Id campaignId;
    }
    public class Output {
        @InvocableVariable(label='Campaign ID') public Id campaignId;
        @InvocableVariable(label='Campaign Name') public String campaignName;
        @InvocableVariable(label='Bounded Campaign Context') public String contextJson;
        @InvocableVariable(label='Campaign Found') public Boolean found;
    }

    @InvocableMethod(label='Get Campaign Context' description='Reads bounded campaign context for Northstar readiness review.')
    public static List<Output> run(List<Input> inputs) {
        Set<Id> ids = new Set<Id>();
        for (Input item : inputs) if (item != null && item.campaignId != null) ids.add(item.campaignId);
        Map<Id, Campaign> campaigns = new Map<Id, Campaign>([
            SELECT Id, Name, Status, Type, Description, StartDate, EndDate, OwnerId
            FROM Campaign WHERE Id IN :ids WITH USER_MODE
        ]);
        List<Output> results = new List<Output>();
        for (Input item : inputs) {
            Output result = new Output();
            Campaign campaign = item == null ? null : campaigns.get(item.campaignId);
            result.found = campaign != null;
            if (campaign != null) {
                result.campaignId = campaign.Id;
                result.campaignName = campaign.Name;
                result.contextJson = JSON.serialize(new Map<String, Object>{
                    'id' => campaign.Id,
                    'name' => campaign.Name,
                    'status' => campaign.Status,
                    'type' => campaign.Type,
                    'description' => campaign.Description,
                    'startDate' => campaign.StartDate,
                    'endDate' => campaign.EndDate,
                    'ownerId' => campaign.OwnerId
                });
            }
            results.add(result);
        }
        return results;
    }
}
