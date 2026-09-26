global with sharing class NorthstarSaveMessage {
    global class Input {
        @InvocableVariable(label='Message ID' description='Existing Northstar Message to update; leave empty to create a new message.') global Id messageId;
        @InvocableVariable(label='Campaign ID' description='Campaign the message belongs to; leave empty to create the campaign named in New Campaign Name.') global Id campaignId;
        @InvocableVariable(label='New Campaign Name' description='Name for a new campaign when no Campaign ID is given; at most 80 characters.') global String newCampaignName;
        @InvocableVariable(label='Brand' description='The Northstar brand for a new campaign, such as Coastline Kitchen.') global String brand;
        @InvocableVariable(required=true label='Title' description='Message title; at most 80 characters.') global String title;
        @InvocableVariable(required=true label='Channel' description='Email, Push, or SMS.') global String channel;
        @InvocableVariable(label='Subject or Headline' description='Email subject line or push headline.') global String subject;
        @InvocableVariable(label='Preheader' description='Email preheader.') global String preheader;
        @InvocableVariable(required=true label='Body' description='Confirmed message body; at most 32,000 characters.') global String body;
        @InvocableVariable(label='Send Time' description='Proposed send time; nothing is scheduled.') global String sendTime;
        @InvocableVariable(label='Audience' description='Who the message is for.') global String audience;
        @InvocableVariable(label='Draft Fields' description='Every labeled field of the confirmed draft, as JSON.') global String draftFields;
        @InvocableVariable(label='Draft ID' description='The workbench draft this message was saved from.') global String draftId;
        @InvocableVariable(label='Draft Version' description='The confirmed workbench draft version.') global Integer draftVersion;
        @InvocableVariable(required=true label='Confirmation ID' description='Versioned, unexpired, same-user signed confirmation token issued by the Northstar host.') global String confirmationId;
        @InvocableVariable(required=true label='Request Hash' description='SHA-256 hash that binds the confirmation to these exact write arguments.') global String requestHash;
        @InvocableVariable(required=true label='Idempotency Key' description='Unique replay-safe key for this confirmed write request.') global String idempotencyKey;
    }
    global class Output {
        @InvocableVariable(label='Message ID' description='Northstar Message ID read back after the write.') global Id messageId;
        @InvocableVariable(label='Campaign ID' description='Campaign the message belongs to, read back after the write.') global Id campaignId;
        @InvocableVariable(label='Title' description='Authoritative message title read back after the write.') global String title;
        @InvocableVariable(label='Status' description='Message status read back after the write; always Draft.') global String status;
        @InvocableVariable(label='Created' description='True when this write created the message.') global Boolean created;
        @InvocableVariable(label='Campaign Created' description='True when this write also created the campaign.') global Boolean campaignCreated;
        @InvocableVariable(label='Idempotent Replay' description='True when this idempotency key had already been applied and no duplicate write occurred.') global Boolean replayed;
        @InvocableVariable(label='Authoritative Read Back' description='True only when Salesforce read-back matched the confirmed message.') global Boolean readBack;
    }

    private static final Set<String> CHANNELS = new Set<String>{ 'Email', 'Push', 'SMS' };

    @InvocableMethod(label='Save Message' description='Creates or updates one draft email, push, or SMS message after host confirmation and reads it back. Nothing is sent or scheduled.')
    global static List<Output> run(List<Input> inputs) {
        List<Output> results = new List<Output>();
        for (Input item : inputs) {
            if (item == null || String.isBlank(item.title) || item.title.length() > 80 ||
                String.isBlank(item.body) || item.body.length() > 32000 || !CHANNELS.contains(item.channel)) {
                throw new NorthstarRecordWrites.WriteException('A bounded title, body, and Email, Push, or SMS channel are required.');
            }
            try {
                NorthstarConfirmationVerifier.requireValidFor(
                    'save-message', NorthstarRecordWrites.subject(item.messageId, item.campaignId),
                    item.confirmationId, item.requestHash, item.idempotencyKey
                );
            } catch (NorthstarConfirmationVerifier.ConfirmationException error) {
                throw new NorthstarRecordWrites.WriteException(error.getMessage());
            }
            List<Northstar_Message__c> replay = [
                SELECT Id FROM Northstar_Message__c
                WHERE Northstar_Idempotency_Key__c = :item.idempotencyKey WITH USER_MODE LIMIT 1
            ];
            Boolean replayed = !replay.isEmpty();
            Boolean created = false;
            Boolean campaignCreated = false;
            Id messageId = replayed ? replay[0].Id : item.messageId;
            if (!replayed) {
                Northstar_Message__c message;
                if (item.messageId != null) {
                    message = [SELECT Id FROM Northstar_Message__c WHERE Id = :item.messageId WITH USER_MODE LIMIT 1];
                } else {
                    NorthstarRecordWrites.CampaignResult campaign = NorthstarRecordWrites.ensureCampaign(
                        item.campaignId, item.newCampaignName, item.brand, item.idempotencyKey
                    );
                    message = new Northstar_Message__c(Campaign__c = campaign.campaignId);
                    campaignCreated = campaign.created;
                }
                message.Name = item.title;
                message.Channel__c = item.channel;
                message.Subject__c = NorthstarRecordWrites.bounded(item.subject, 255);
                message.Preheader__c = NorthstarRecordWrites.bounded(item.preheader, 255);
                message.Body__c = item.body;
                message.Send_Time__c = NorthstarRecordWrites.bounded(item.sendTime, 120);
                message.Audience__c = NorthstarRecordWrites.bounded(item.audience, 255);
                message.Status__c = 'Draft';
                message.Draft_Fields__c = NorthstarRecordWrites.bounded(item.draftFields, 32000);
                message.Source_Draft_Id__c = NorthstarRecordWrites.bounded(item.draftId, 80);
                message.Draft_Version__c = item.draftVersion;
                message.Northstar_Idempotency_Key__c = item.idempotencyKey;
                created = item.messageId == null;
                if (created) insert as user message; else update as user message;
                messageId = message.Id;
            }
            Northstar_Message__c readBack = [
                SELECT Id, Name, Campaign__c, Body__c, Status__c, Northstar_Idempotency_Key__c
                FROM Northstar_Message__c WHERE Id = :messageId WITH USER_MODE
            ];
            if (readBack.Body__c != item.body || readBack.Northstar_Idempotency_Key__c != item.idempotencyKey) {
                throw new NorthstarRecordWrites.WriteException('Authoritative read-back did not match the confirmed message.');
            }
            Output result = new Output();
            result.messageId = readBack.Id;
            result.campaignId = readBack.Campaign__c;
            result.title = readBack.Name;
            result.status = readBack.Status__c;
            result.created = created;
            result.campaignCreated = campaignCreated;
            result.replayed = replayed;
            result.readBack = true;
            results.add(result);
        }
        return results;
    }
}
