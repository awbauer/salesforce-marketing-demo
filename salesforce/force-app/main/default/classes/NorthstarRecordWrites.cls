/**
 * Shared steps for the workbench's confirmed record writes: the confirmation subject, and the
 * campaign a new brief or message belongs to (an existing one, or one created in the same
 * confirmed write).
 */
public with sharing class NorthstarRecordWrites {
    /** The record a confirmation is bound to: the one being updated, its parent, or 'new'. */
    public static String subject(Id recordId, Id parentId) {
        if (recordId != null) return String.valueOf(recordId);
        if (parentId != null) return String.valueOf(parentId);
        return 'new';
    }

    public class CampaignResult {
        public Id campaignId;
        public Boolean created = false;
    }

    /** The campaign to attach to, creating one named newCampaignName when none is given. */
    public static CampaignResult ensureCampaign(
        Id campaignId, String newCampaignName, String brand, String idempotencyKey
    ) {
        CampaignResult result = new CampaignResult();
        if (campaignId != null) {
            result.campaignId = [SELECT Id FROM Campaign WHERE Id = :campaignId WITH USER_MODE LIMIT 1].Id;
            return result;
        }
        if (String.isBlank(newCampaignName) || newCampaignName.length() > 80) {
            throw new WriteException('An existing campaign or a new campaign name is required.');
        }
        List<Campaign> replay = [
            SELECT Id FROM Campaign WHERE Northstar_Idempotency_Key__c = :idempotencyKey WITH USER_MODE LIMIT 1
        ];
        if (!replay.isEmpty()) {
            result.campaignId = replay[0].Id;
            return result;
        }
        Campaign campaign = new Campaign(
            Name = newCampaignName,
            Status = 'Planned',
            IsActive = false,
            Northstar_Brand__c = bounded(brand, 80),
            Northstar_Idempotency_Key__c = idempotencyKey
        );
        insert as user campaign;
        result.campaignId = campaign.Id;
        result.created = true;
        return result;
    }

    public static String bounded(String value, Integer maxLength) {
        if (value == null) return null;
        return value.length() > maxLength ? value.substring(0, maxLength) : value;
    }

    public class WriteException extends Exception {}
}
