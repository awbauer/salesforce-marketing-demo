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
        @InvocableVariable(label='Subject' description='Authoritative Salesforce Task subject read back after creation or replay.') global String subject;
        @InvocableVariable(label='Priority' description='Authoritative Salesforce Task priority read back after creation or replay.') global String priority;
        @InvocableVariable(label='Due Date' description='Authoritative Salesforce Task due date read back after creation or replay.') global Date dueDate;
        @InvocableVariable(label='Description' description='Campaign context, readiness findings, and review checklist read back from Salesforce.') global String description;
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
            Campaign campaign = [
                SELECT Id, Name, Status, Type, Description, StartDate, EndDate
                FROM Campaign WHERE Id = :item.campaignId WITH USER_MODE
            ];
            List<Task> existing = [
                SELECT Id, WhatId, Subject, Status, Priority, ActivityDate, Description,
                    Northstar_Idempotency_Key__c
                FROM Task WHERE Northstar_Idempotency_Key__c = :item.idempotencyKey WITH USER_MODE LIMIT 1
            ];
            Boolean replayed = !existing.isEmpty();
            Task reviewTask;
            if (replayed) reviewTask = existing[0];
            else {
                List<String> findings = readinessFindings(campaign);
                String expectedSubject = truncate('Review campaign readiness: ' + campaign.Name, 255);
                String expectedDescription = reviewDescription(campaign, findings);
                reviewTask = new Task(
                    WhatId = item.campaignId,
                    Subject = expectedSubject,
                    Status = 'Not Started',
                    Priority = findings.isEmpty() ? 'Normal' : 'High',
                    ActivityDate = Date.today().addDays(2),
                    Description = expectedDescription,
                    Northstar_Idempotency_Key__c = item.idempotencyKey
                );
                insert as user reviewTask;
            }
            Task readBack = [
                SELECT Id, WhatId, Subject, Status, Priority, ActivityDate, Description
                FROM Task WHERE Id = :reviewTask.Id WITH USER_MODE
            ];
            if (readBack.WhatId != item.campaignId || String.isBlank(readBack.Subject) ||
                String.isBlank(readBack.Description) || readBack.ActivityDate == null) {
                throw new NorthstarReviewException('Salesforce review Task read-back was incomplete.');
            }
            Output result = new Output();
            result.taskId = readBack.Id;
            result.campaignId = readBack.WhatId;
            result.status = readBack.Status;
            result.subject = readBack.Subject;
            result.priority = readBack.Priority;
            result.dueDate = readBack.ActivityDate;
            result.description = readBack.Description;
            result.replayed = replayed;
            result.readBack = true;
            results.add(result);
        }
        return results;
    }

    private static List<String> readinessFindings(Campaign campaign) {
        List<String> findings = new List<String>();
        if (String.isBlank(campaign.Description)) findings.add('Campaign brief is missing.');
        if (campaign.StartDate == null || campaign.EndDate == null) findings.add('Campaign dates are incomplete.');
        if (campaign.StartDate != null && campaign.EndDate != null && campaign.EndDate < campaign.StartDate) {
            findings.add('Campaign end date precedes start date.');
        }
        if (campaign.Description != null && campaign.Description.toLowerCase().contains('ignore previous instructions')) {
            findings.add('Campaign content contains an instruction-like phrase requiring review.');
        }
        return findings;
    }

    private static String reviewDescription(Campaign campaign, List<String> findings) {
        List<String> lines = new List<String>{
            'Campaign review requested by Northstar Marketing Workbench', '',
            'Campaign: ' + campaign.Name,
            'Status: ' + valueOrNotSet(campaign.Status),
            'Type: ' + valueOrNotSet(campaign.Type),
            'Schedule: ' + (campaign.StartDate == null ? 'Not set' : String.valueOf(campaign.StartDate)) +
                ' to ' + (campaign.EndDate == null ? 'Not set' : String.valueOf(campaign.EndDate)), '',
            'Draft brief',
            String.isBlank(campaign.Description) ? 'No campaign brief has been saved.' : campaign.Description, '',
            'Readiness findings (' + findings.size() + ')'
        };
        if (findings.isEmpty()) lines.add('- No automated blockers found; human review is still required.');
        else for (String finding : findings) lines.add('- ' + finding);
        lines.addAll(new List<String>{
            '', 'Review checklist',
            '1. Resolve each readiness finding.',
            '2. Confirm content, accessibility, consent, and schedule.',
            '3. Update the campaign and return it for readiness review.', '',
            'Salesforce campaign: ' + campaign.Id
        });
        return truncate(String.join(lines, '\n'), 32000);
    }

    private static String valueOrNotSet(String value) {
        return String.isBlank(value) ? 'Not set' : value;
    }

    private static String truncate(String value, Integer maximumLength) {
        return value.length() <= maximumLength ? value : value.substring(0, maximumLength);
    }
    public class NorthstarReviewException extends Exception {}
}
