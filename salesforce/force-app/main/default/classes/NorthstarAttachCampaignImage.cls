global with sharing class NorthstarAttachCampaignImage {
    // Keeps the decoded image, its base64 input, and hashing inside the synchronous Apex heap limit.
    private static final Integer MAX_IMAGE_BYTES = 3 * 1024 * 1024;
    // Base64 of the eight-byte PNG signature, checked without hex-encoding the whole image.
    private static final String PNG_BASE64_PREFIX = 'iVBORw0KGgo';

    global class Input {
        @InvocableVariable(required=true label='Campaign ID' description='Salesforce Campaign ID that the selected image is attached to.') global Id campaignId;
        @InvocableVariable(required=true label='Image Base64' description='Base64-encoded PNG bytes of the generated draft the user selected.') global String imageBase64;
        @InvocableVariable(required=true label='Content Hash' description='Lowercase SHA-256 hex digest of the PNG bytes, bound into the request hash.') global String contentHash;
        @InvocableVariable(required=true label='Title' description='File title shown on the Campaign.') global String title;
        @InvocableVariable(required=true label='Alt Text' description='Accessible description of the image, stored as the file description.') global String altText;
        @InvocableVariable(required=true label='Confirmation ID' description='Versioned, unexpired, same-user signed confirmation token issued by the Northstar host.') global String confirmationId;
        @InvocableVariable(required=true label='Request Hash' description='SHA-256 hash that binds the confirmation to these exact write arguments.') global String requestHash;
        @InvocableVariable(required=true label='Idempotency Key' description='Unique replay-safe key for this confirmed attachment.') global String idempotencyKey;
    }
    global class Output {
        @InvocableVariable(label='Content Version ID' description='Salesforce ContentVersion ID read back after attachment or replay.') global Id contentVersionId;
        @InvocableVariable(label='Content Document ID' description='Salesforce ContentDocument ID linked to the Campaign.') global Id contentDocumentId;
        @InvocableVariable(label='Campaign ID' description='Salesforce Campaign ID the file is linked to, read back from ContentDocumentLink.') global Id campaignId;
        @InvocableVariable(label='Title' description='Authoritative file title read back from Salesforce.') global String title;
        @InvocableVariable(label='Content Size' description='Authoritative stored file size in bytes.') global Integer contentSize;
        @InvocableVariable(label='Content Hash' description='SHA-256 digest of the bytes that Salesforce stored, verified through the stored checksum.') global String contentHash;
        @InvocableVariable(label='Idempotent Replay' description='True when this idempotency key already identified an attached file and no duplicate was created.') global Boolean replayed;
        @InvocableVariable(label='Authoritative Read Back' description='True only after Salesforce reads back the file, its checksum, and its Campaign link.') global Boolean readBack;
    }

    @InvocableMethod(label='Attach Campaign Image' description='Attaches one confirmed, hash-verified generated image to a Campaign as a Salesforce file.')
    global static List<Output> run(List<Input> inputs) {
        List<Output> results = new List<Output>();
        for (Input item : inputs) {
            if (item == null) {
                throw new NorthstarAttachException('Confirmation and idempotency fields are required.');
            }
            try {
                NorthstarConfirmationVerifier.requireValid(
                    'attach-generated-image', item.campaignId, item.confirmationId, item.requestHash,
                    item.idempotencyKey
                );
            } catch (NorthstarConfirmationVerifier.ConfirmationException error) {
                throw new NorthstarAttachException(error.getMessage());
            }
            Campaign campaign = [SELECT Id FROM Campaign WHERE Id = :item.campaignId WITH USER_MODE];
            List<ContentVersion> existing = [
                SELECT Id FROM ContentVersion
                WHERE Northstar_Idempotency_Key__c = :item.idempotencyKey WITH USER_MODE LIMIT 1
            ];
            Boolean replayed = !existing.isEmpty();
            String expectedMd5;
            Id versionId;
            if (replayed) {
                versionId = existing[0].Id;
            } else {
                Blob image = decodeAndVerify(item);
                expectedMd5 = EncodingUtil.convertToHex(Crypto.generateDigest('MD5', image)).toLowerCase();
                ContentVersion version = new ContentVersion(
                    Title = truncate(item.title.trim(), 255),
                    PathOnClient = 'northstar-campaign-image.png',
                    Description = truncate(item.altText.trim(), 1000),
                    VersionData = image,
                    FirstPublishLocationId = campaign.Id,
                    Northstar_Idempotency_Key__c = item.idempotencyKey
                );
                image = null;
                insert as user version;
                versionId = version.Id;
            }
            ContentVersion readBack = [
                SELECT Id, ContentDocumentId, Title, ContentSize, Checksum, FileExtension
                FROM ContentVersion WHERE Id = :versionId WITH USER_MODE
            ];
            List<ContentDocumentLink> links = [
                SELECT Id, LinkedEntityId FROM ContentDocumentLink
                WHERE ContentDocumentId = :readBack.ContentDocumentId AND LinkedEntityId = :campaign.Id
                WITH USER_MODE LIMIT 1
            ];
            if (links.isEmpty() || readBack.FileExtension != 'png' || readBack.ContentSize == null ||
                (expectedMd5 != null && !expectedMd5.equalsIgnoreCase(readBack.Checksum))) {
                throw new NorthstarAttachException('Salesforce file read-back was incomplete or did not match the confirmed image.');
            }
            Output result = new Output();
            result.contentVersionId = readBack.Id;
            result.contentDocumentId = readBack.ContentDocumentId;
            result.campaignId = links[0].LinkedEntityId;
            result.title = readBack.Title;
            result.contentSize = readBack.ContentSize;
            result.contentHash = item.contentHash.toLowerCase();
            result.replayed = replayed;
            result.readBack = true;
            results.add(result);
        }
        return results;
    }

    private static Blob decodeAndVerify(Input item) {
        if (String.isBlank(item.imageBase64) || String.isBlank(item.title) || String.isBlank(item.altText) ||
            String.isBlank(item.contentHash) || !Pattern.matches('^[a-fA-F0-9]{64}$', item.contentHash)) {
            throw new NorthstarAttachException('A PNG image, content hash, title, and alt text are required.');
        }
        if (item.imageBase64.length() > (MAX_IMAGE_BYTES / 3) * 4 + 4) {
            throw new NorthstarAttachException('The image exceeds the attachment size limit.');
        }
        if (!item.imageBase64.startsWith(PNG_BASE64_PREFIX)) {
            throw new NorthstarAttachException('Only PNG images can be attached.');
        }
        Blob image;
        try {
            image = EncodingUtil.base64Decode(item.imageBase64);
        } catch (Exception error) {
            throw new NorthstarAttachException('The image is not valid base64.');
        }
        if (image.size() == 0 || image.size() > MAX_IMAGE_BYTES) {
            throw new NorthstarAttachException('The image exceeds the attachment size limit.');
        }
        String actualHash = EncodingUtil.convertToHex(Crypto.generateDigest('SHA-256', image)).toLowerCase();
        if (actualHash != item.contentHash.toLowerCase()) {
            throw new NorthstarAttachException('The image bytes do not match the confirmed content hash.');
        }
        return image;
    }

    private static String truncate(String value, Integer maximumLength) {
        return value.length() <= maximumLength ? value : value.substring(0, maximumLength);
    }
    public class NorthstarAttachException extends Exception {}
}
