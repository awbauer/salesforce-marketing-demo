global with sharing class NorthstarSaveBrief {
    global class Input {
        @InvocableVariable(label='Brief ID' description='Existing Northstar Brief to update; leave empty to create a new brief.') global Id briefId;
        @InvocableVariable(label='Campaign ID' description='Campaign the brief belongs to; leave empty to create the campaign named in New Campaign Name.') global Id campaignId;
        @InvocableVariable(label='New Campaign Name' description='Name for a new campaign when no Campaign ID is given; at most 80 characters.') global String newCampaignName;
        @InvocableVariable(label='Brand' description='The Northstar brand for a new campaign, such as Coastline Kitchen.') global String brand;
        @InvocableVariable(required=true label='Title' description='Brief title; at most 80 characters.') global String title;
        @InvocableVariable(label='Objective' description='What the campaign should achieve.') global String objective;
        @InvocableVariable(label='Audience' description='Who the campaign is for.') global String audience;
        @InvocableVariable(label='Channel' description='Where the campaign runs.') global String channel;
        @InvocableVariable(required=true label='Body' description='Confirmed brief text; at most 32,000 characters.') global String body;
        @InvocableVariable(label='Draft Fields' description='Every labeled field of the confirmed draft, as JSON.') global String draftFields;
        @InvocableVariable(label='Draft ID' description='The workbench draft this brief was saved from.') global String draftId;
        @InvocableVariable(label='Draft Version' description='The confirmed workbench draft version.') global Integer draftVersion;
        @InvocableVariable(required=true label='Confirmation ID' description='Versioned, unexpired, same-user signed confirmation token issued by the Northstar host.') global String confirmationId;
        @InvocableVariable(required=true label='Request Hash' description='SHA-256 hash that binds the confirmation to these exact write arguments.') global String requestHash;
        @InvocableVariable(required=true label='Idempotency Key' description='Unique replay-safe key for this confirmed write request.') global String idempotencyKey;
    }
    global class Output {
        @InvocableVariable(label='Brief ID' description='Northstar Brief ID read back after the write.') global Id briefId;
        @InvocableVariable(label='Campaign ID' description='Campaign the brief belongs to, read back after the write.') global Id campaignId;
        @InvocableVariable(label='Title' description='Authoritative brief title read back after the write.') global String title;
        @InvocableVariable(label='Created' description='True when this write created the brief.') global Boolean created;
        @InvocableVariable(label='Campaign Created' description='True when this write also created the campaign.') global Boolean campaignCreated;
        @InvocableVariable(label='Idempotent Replay' description='True when this idempotency key had already been applied and no duplicate write occurred.') global Boolean replayed;
        @InvocableVariable(label='Authoritative Read Back' description='True only when Salesforce read-back matched the confirmed brief.') global Boolean readBack;
    }

    @InvocableMethod(label='Save Brief' description='Creates or updates one campaign brief after host confirmation and reads it back.')
    global static List<Output> run(List<Input> inputs) {
        List<Output> results = new List<Output>();
        for (Input item : inputs) {
            if (item == null || String.isBlank(item.title) || item.title.length() > 80 ||
                String.isBlank(item.body) || item.body.length() > 32000) {
                throw new NorthstarRecordWrites.WriteException('A bounded brief title and body are required.');
            }
            try {
                NorthstarConfirmationVerifier.requireValidFor(
                    'save-brief', NorthstarRecordWrites.subject(item.briefId, item.campaignId),
                    item.confirmationId, item.requestHash, item.idempotencyKey
                );
            } catch (NorthstarConfirmationVerifier.ConfirmationException error) {
                throw new NorthstarRecordWrites.WriteException(error.getMessage());
            }
            List<Northstar_Brief__c> replay = [
                SELECT Id, Campaign__c FROM Northstar_Brief__c
                WHERE Northstar_Idempotency_Key__c = :item.idempotencyKey WITH USER_MODE LIMIT 1
            ];
            Boolean replayed = !replay.isEmpty();
            Boolean created = false;
            Boolean campaignCreated = false;
            Id briefId = replayed ? replay[0].Id : item.briefId;
            if (!replayed) {
                Northstar_Brief__c brief;
                if (item.briefId != null) {
                    brief = [SELECT Id, Campaign__c FROM Northstar_Brief__c WHERE Id = :item.briefId WITH USER_MODE LIMIT 1];
                } else {
                    NorthstarRecordWrites.CampaignResult campaign = NorthstarRecordWrites.ensureCampaign(
                        item.campaignId, item.newCampaignName, item.brand, item.idempotencyKey
                    );
                    brief = new Northstar_Brief__c(Campaign__c = campaign.campaignId);
                    campaignCreated = campaign.created;
                }
                brief.Name = item.title;
                brief.Objective__c = NorthstarRecordWrites.bounded(item.objective, 255);
                brief.Audience__c = NorthstarRecordWrites.bounded(item.audience, 255);
                brief.Channel__c = NorthstarRecordWrites.bounded(item.channel, 255);
                brief.Body__c = item.body;
                brief.Draft_Fields__c = NorthstarRecordWrites.bounded(item.draftFields, 32000);
                brief.Source_Draft_Id__c = NorthstarRecordWrites.bounded(item.draftId, 80);
                brief.Draft_Version__c = item.draftVersion;
                brief.Northstar_Idempotency_Key__c = item.idempotencyKey;
                created = item.briefId == null;
                if (created) insert as user brief; else update as user brief;
                briefId = brief.Id;
            }
            Northstar_Brief__c readBack = [
                SELECT Id, Name, Campaign__c, Body__c, Northstar_Idempotency_Key__c
                FROM Northstar_Brief__c WHERE Id = :briefId WITH USER_MODE
            ];
            if (readBack.Body__c != item.body || readBack.Northstar_Idempotency_Key__c != item.idempotencyKey) {
                throw new NorthstarRecordWrites.WriteException('Authoritative read-back did not match the confirmed brief.');
            }
            Output result = new Output();
            result.briefId = readBack.Id;
            result.campaignId = readBack.Campaign__c;
            result.title = readBack.Name;
            result.created = created;
            result.campaignCreated = campaignCreated;
            result.replayed = replayed;
            result.readBack = true;
            results.add(result);
        }
        return results;
    }
}
