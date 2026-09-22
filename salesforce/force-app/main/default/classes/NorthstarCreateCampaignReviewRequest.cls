global with sharing class NorthstarCreateCampaignReviewRequest {
    global class Input {
        @InvocableVariable(required=true label='Campaign ID' description='Salesforce Campaign ID that the review Task should reference.') global Id campaignId;
        @InvocableVariable(required=true label='Confirmation ID' description='Versioned, unexpired, same-user signed confirmation token issued by the Northstar host.') global String confirmationId;
        @InvocableVariable(required=true label='Request Hash' description='SHA-256 hash that binds the confirmation to these exact write arguments.') global String requestHash;
        @InvocableVariable(required=true label='Idempotency Key' description='Unique replay-safe key for this confirmed review request.') global String idempotencyKey;
    }
    global class Output {
        @InvocableVariable(label='Task ID' description='Salesforce Task ID read back after creation or replay.') global Id taskId;
        @InvocableVariable(label='Campaign ID' description='Salesforce Campaign ID referenced by the review Task.') global Id campaignId;
        @InvocableVariable(label='Status' description='Authoritative Salesforce Task status read back after creation or replay.') global String status;
        @InvocableVariable(label='Idempotent Replay' description='True when this idempotency key already identified a review Task and no duplicate was created.') global Boolean replayed;
        @InvocableVariable(label='Authoritative Read Back' description='True only after Salesforce successfully reads back the review Task.') global Boolean readBack;
    }

    @InvocableMethod(label='Create Campaign Review Request' description='Creates one idempotent review Task after host confirmation.')
    global static List<Output> run(List<Input> inputs) {
        List<Output> results = new List<Output>();
        for (Input item : inputs) {
            if (item == null) {
                throw new NorthstarReviewException('Confirmation and idempotency fields are required.');
            }
            try {
                NorthstarConfirmationVerifier.requireValid(
                    'create-review-task', item.campaignId, item.confirmationId, item.requestHash,
                    item.idempotencyKey
                );
            } catch (NorthstarConfirmationVerifier.ConfirmationException error) {
                throw new NorthstarReviewException(error.getMessage());
            }
            List<Task> existing = [
                SELECT Id, WhatId, Status, Northstar_Idempotency_Key__c
                FROM Task WHERE Northstar_Idempotency_Key__c = :item.idempotencyKey WITH USER_MODE LIMIT 1
            ];
            Boolean replayed = !existing.isEmpty();
            Task reviewTask;
            if (replayed) reviewTask = existing[0];
            else {
                reviewTask = new Task(
                    WhatId = item.campaignId,
                    Subject = 'Northstar campaign readiness review',
                    Status = 'Not Started',
                    Priority = 'Normal',
                    Description = 'Northstar confirmed request ' + item.requestHash,
                    Northstar_Idempotency_Key__c = item.idempotencyKey
                );
                insert as user reviewTask;
            }
            Task readBack = [SELECT Id, WhatId, Status FROM Task WHERE Id = :reviewTask.Id WITH USER_MODE];
            Output result = new Output();
            result.taskId = readBack.Id;
            result.campaignId = readBack.WhatId;
            result.status = readBack.Status;
            result.replayed = replayed;
            result.readBack = true;
            results.add(result);
        }
        return results;
    }
    public class NorthstarReviewException extends Exception {}
}
