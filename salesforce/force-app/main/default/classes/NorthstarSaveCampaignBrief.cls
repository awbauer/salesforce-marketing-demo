global with sharing class NorthstarSaveCampaignBrief {
    global class Input {
        @InvocableVariable(required=true label='Campaign ID' description='Salesforce Campaign ID whose draft Description should be saved.') global Id campaignId;
        @InvocableVariable(required=true label='Draft Brief' description='Confirmed campaign brief to save as the Campaign Description; maximum 32,000 characters.') global String brief;
        @InvocableVariable(required=true label='Confirmation ID' description='Versioned, unexpired, same-user signed confirmation token issued by the Northstar host.') global String confirmationId;
        @InvocableVariable(required=true label='Request Hash' description='SHA-256 hash that binds the confirmation to these exact write arguments.') global String requestHash;
        @InvocableVariable(required=true label='Idempotency Key' description='Unique replay-safe key for this confirmed write request.') global String idempotencyKey;
    }
    global class Output {
        @InvocableVariable(label='Campaign ID' description='Salesforce Campaign ID read back after the write.') global Id campaignId;
        @InvocableVariable(label='Status' description='Authoritative Salesforce Campaign status read back after the write.') global String status;
        @InvocableVariable(label='Idempotent Replay' description='True when this idempotency key had already been applied and no duplicate write occurred.') global Boolean replayed;
        @InvocableVariable(label='Authoritative Read Back' description='True only when Salesforce read-back matched the confirmed brief and idempotency key.') global Boolean readBack;
    }

    @InvocableMethod(label='Save Campaign Brief' description='Saves a bounded draft brief after host confirmation and reads it back.')
    global static List<Output> run(List<Input> inputs) {
        List<Output> results = new List<Output>();
        for (Input item : inputs) {
            if (item == null || String.isBlank(item.brief) || item.brief.length() > 32000) {
                throw new NorthstarBriefException('Bounded brief, confirmation, and idempotency fields are required.');
            }
            try {
                NorthstarConfirmationVerifier.requireValid(
                    'save-draft-campaign', item.campaignId, item.confirmationId, item.requestHash,
                    item.idempotencyKey
                );
            } catch (NorthstarConfirmationVerifier.ConfirmationException error) {
                throw new NorthstarBriefException(error.getMessage());
            }
            Campaign campaign = [
                SELECT Id, Status, Description, Northstar_Idempotency_Key__c
                FROM Campaign WHERE Id = :item.campaignId WITH USER_MODE LIMIT 1
            ];
            Boolean replayed = campaign.Northstar_Idempotency_Key__c == item.idempotencyKey;
            if (!replayed) {
                campaign.Description = item.brief;
                campaign.Northstar_Idempotency_Key__c = item.idempotencyKey;
                update as user campaign;
            }
            Campaign readBack = [
                SELECT Id, Status, Description, Northstar_Idempotency_Key__c
                FROM Campaign WHERE Id = :campaign.Id WITH USER_MODE
            ];
            if (readBack.Description != item.brief || readBack.Northstar_Idempotency_Key__c != item.idempotencyKey) {
                throw new NorthstarBriefException('Authoritative read-back did not match the confirmed draft.');
            }
            Output result = new Output();
            result.campaignId = readBack.Id;
            result.status = readBack.Status;
            result.replayed = replayed;
            result.readBack = true;
            results.add(result);
        }
        return results;
    }
    public class NorthstarBriefException extends Exception {}
}
