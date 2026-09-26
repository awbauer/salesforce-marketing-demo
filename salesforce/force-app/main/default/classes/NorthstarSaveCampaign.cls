global with sharing class NorthstarSaveCampaign {
    global class Input {
        @InvocableVariable(label='Campaign ID' description='Existing Salesforce Campaign to update; leave empty to create a new campaign.') global Id campaignId;
        @InvocableVariable(required=true label='Campaign Name' description='Campaign name, at most 80 characters.') global String name;
        @InvocableVariable(label='Brand' description='The Northstar brand that owns the campaign, such as Coastline Kitchen.') global String brand;
        @InvocableVariable(label='Description' description='Confirmed campaign description; at most 32,000 characters.') global String description;
        @InvocableVariable(required=true label='Confirmation ID' description='Versioned, unexpired, same-user signed confirmation token issued by the Northstar host.') global String confirmationId;
        @InvocableVariable(required=true label='Request Hash' description='SHA-256 hash that binds the confirmation to these exact write arguments.') global String requestHash;
        @InvocableVariable(required=true label='Idempotency Key' description='Unique replay-safe key for this confirmed write request.') global String idempotencyKey;
    }
    global class Output {
        @InvocableVariable(label='Campaign ID' description='Salesforce Campaign ID read back after the write.') global Id campaignId;
        @InvocableVariable(label='Name' description='Authoritative campaign name read back after the write.') global String name;
        @InvocableVariable(label='Status' description='Authoritative campaign status read back after the write.') global String status;
        @InvocableVariable(label='Created' description='True when this write created the campaign.') global Boolean created;
        @InvocableVariable(label='Idempotent Replay' description='True when this idempotency key had already been applied and no duplicate write occurred.') global Boolean replayed;
        @InvocableVariable(label='Authoritative Read Back' description='True only when Salesforce read-back matched the confirmed campaign.') global Boolean readBack;
    }

    @InvocableMethod(label='Save Campaign' description='Creates or updates one campaign after host confirmation and reads it back.')
    global static List<Output> run(List<Input> inputs) {
        List<Output> results = new List<Output>();
        for (Input item : inputs) {
            if (item == null || String.isBlank(item.name) || item.name.length() > 80 ||
                (item.description != null && item.description.length() > 32000)) {
                throw new NorthstarRecordWrites.WriteException('A bounded campaign name and description are required.');
            }
            try {
                NorthstarConfirmationVerifier.requireValidFor(
                    'save-campaign', NorthstarRecordWrites.subject(item.campaignId, null),
                    item.confirmationId, item.requestHash, item.idempotencyKey
                );
            } catch (NorthstarConfirmationVerifier.ConfirmationException error) {
                throw new NorthstarRecordWrites.WriteException(error.getMessage());
            }
            List<Campaign> replay = [
                SELECT Id FROM Campaign WHERE Northstar_Idempotency_Key__c = :item.idempotencyKey WITH USER_MODE LIMIT 1
            ];
            Boolean replayed = !replay.isEmpty();
            Boolean created = false;
            Id campaignId = replayed ? replay[0].Id : item.campaignId;
            if (!replayed) {
                Campaign campaign = item.campaignId == null
                    ? new Campaign(Status = 'Planned', IsActive = false)
                    : [SELECT Id FROM Campaign WHERE Id = :item.campaignId WITH USER_MODE LIMIT 1];
                campaign.Name = item.name;
                // An update changes only what was confirmed; omitted fields keep their values.
                if (item.description != null) campaign.Description = item.description;
                if (item.brand != null) campaign.Northstar_Brand__c = NorthstarRecordWrites.bounded(item.brand, 80);
                campaign.Northstar_Idempotency_Key__c = item.idempotencyKey;
                created = item.campaignId == null;
                if (created) insert as user campaign; else update as user campaign;
                campaignId = campaign.Id;
            }
            Campaign readBack = [
                SELECT Id, Name, Status, Description, Northstar_Idempotency_Key__c
                FROM Campaign WHERE Id = :campaignId WITH USER_MODE
            ];
            if (readBack.Name != item.name || readBack.Northstar_Idempotency_Key__c != item.idempotencyKey) {
                throw new NorthstarRecordWrites.WriteException('Authoritative read-back did not match the confirmed campaign.');
            }
            Output result = new Output();
            result.campaignId = readBack.Id;
            result.name = readBack.Name;
            result.status = readBack.Status;
            result.created = created;
            result.replayed = replayed;
            result.readBack = true;
            results.add(result);
        }
        return results;
    }
}
