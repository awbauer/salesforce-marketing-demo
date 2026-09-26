public without sharing class NorthstarConfirmationVerifier {
    private static final Long MAX_FUTURE_SECONDS = 300;

    public static void requireValid(
        String action,
        Id campaignId,
        String signedConfirmation,
        String requestHash,
        String idempotencyKey
    ) {
        requireValidFor(
            action, campaignId == null ? null : String.valueOf(campaignId), signedConfirmation,
            requestHash, idempotencyKey
        );
    }

    /**
     * Verifies a confirmation bound to a subject: the record being updated, the parent record a
     * new record is created under, or 'new' for a record with no parent yet.
     */
    public static void requireValidFor(
        String action,
        String subject,
        String signedConfirmation,
        String requestHash,
        String idempotencyKey
    ) {
        if (
            String.isBlank(action) || String.isBlank(subject) || String.isBlank(signedConfirmation) ||
            !isHex(requestHash, 64) || String.isBlank(idempotencyKey)
        ) {
            throw new ConfirmationException('Valid signed confirmation evidence is required.');
        }
        List<String> token = signedConfirmation.split('\\.');
        if (token.size() != 5 || token[0] != 'v1' || String.isBlank(token[1]) ||
            !isHex(token[3], token[3].length()) || !isHex(token[4], 64)) {
            throw new ConfirmationException('Valid signed confirmation evidence is required.');
        }
        Long confirmationExpiresAt;
        String principalSubject;
        try {
            confirmationExpiresAt = Long.valueOf(token[2]);
            principalSubject = EncodingUtil.convertFromHex(token[3]).toString();
        } catch (Exception error) {
            throw new ConfirmationException('Valid signed confirmation evidence is required.');
        }
        if (String.isBlank(principalSubject)) {
            throw new ConfirmationException('Valid signed confirmation evidence is required.');
        }
        Long now = DateTime.now().getTime() / 1000;
        if (confirmationExpiresAt < now || confirmationExpiresAt > now + MAX_FUTURE_SECONDS) {
            throw new ConfirmationException('The signed confirmation is expired or exceeds five minutes.');
        }
        Northstar_Confirmation_Config__c config = Northstar_Confirmation_Config__c.getOrgDefaults();
        if (config == null || String.isBlank(config.Signing_Key__c)) {
            throw new ConfirmationException('Confirmation verification is not configured.');
        }
        String canonical = String.join(new List<String>{
            action,
            subject,
            token[1],
            requestHash,
            idempotencyKey,
            String.valueOf(confirmationExpiresAt),
            principalSubject
        }, '\n');
        String expected = EncodingUtil.convertToHex(Crypto.generateMac(
            'HmacSHA256',
            Blob.valueOf(canonical),
            Blob.valueOf(config.Signing_Key__c)
        )).toLowerCase();
        if (expected != token[4].toLowerCase()) {
            throw new ConfirmationException('Signed confirmation verification failed.');
        }
    }

    private static Boolean isHex(String value, Integer length) {
        return !String.isBlank(value) && value.length() == length && Pattern.matches('^[a-fA-F0-9]+$', value);
    }

    public class ConfirmationException extends Exception {}
}
