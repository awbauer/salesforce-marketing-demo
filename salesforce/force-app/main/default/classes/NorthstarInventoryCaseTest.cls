@IsTest
private class NorthstarInventoryCaseTest {
    private static final String LOCATION = 'location:sacramento';

    // Apex names are case-insensitive, so parameters here never reuse a constant's name.
    private static String detailsFor(String city) {
        return '{"locationId":"sacramento","city":"' + city + '","managerName":"Test Manager",' +
            '"window":{"from":"2026-09-27","to":"2026-09-29","days":3},"conditions":["cloudy","clear","heat"],' +
            '"items":[{"name":"Açaí packs","unit":"pack","onHand":40,"onOrder":20,"projectedNeed":195.5,"menuItems":["Açaí Sunrise Bowl"]}]}';
    }

    private static String sha256(String value) {
        return EncodingUtil.convertToHex(Crypto.generateDigest('SHA-256', Blob.valueOf(value))).toLowerCase();
    }

    /** The org's signing key, adding a test one when the org has none. */
    private static String signingKey() {
        Northstar_Confirmation_Config__c config = Northstar_Confirmation_Config__c.getOrgDefaults();
        if (config == null || String.isBlank(config.Signing_Key__c)) {
            config = new Northstar_Confirmation_Config__c(
                SetupOwnerId = UserInfo.getOrganizationId(), Signing_Key__c = 'unit-test-key'
            );
            upsert config;
        }
        return config.Signing_Key__c;
    }

    private static NorthstarCreateInventoryCase.Input input(
        String caseJson, String confirmedJson, String idempotencyKey
    ) {
        NorthstarCreateInventoryCase.Input item = new NorthstarCreateInventoryCase.Input();
        item.locationKey = LOCATION;
        item.caseDetailsJson = caseJson;
        item.requestHash = sha256(confirmedJson);
        item.idempotencyKey = idempotencyKey;
        Long expiresAt = DateTime.now().addMinutes(4).getTime() / 1000;
        String confirmationId = 'c2b1f0a4-7a55-4c4b-9e0e-1d3d0f7b9a11';
        String canonical = String.join(new List<String>{
            'create-inventory-case', LOCATION, confirmationId, item.requestHash, idempotencyKey,
            String.valueOf(expiresAt), 'test-evaluator'
        }, '\n');
        String signature = EncodingUtil.convertToHex(Crypto.generateMac(
            'HmacSHA256', Blob.valueOf(canonical), Blob.valueOf(signingKey())
        )).toLowerCase();
        item.confirmationId = String.join(new List<String>{
            'v1', confirmationId, String.valueOf(expiresAt),
            EncodingUtil.convertToHex(Blob.valueOf('test-evaluator')).toLowerCase(), signature
        }, '.');
        return item;
    }

    /** A store manager at a uniquely named test restaurant; returns the restaurant's city. */
    private static String manager() {
        String city = 'Testville ' + String.valueOf(Crypto.getRandomInteger()).replace('-', '');
        Account restaurant = new Account(Name = 'Coastline Kitchen test (fictional)');
        insert restaurant;
        insert new Contact(
            AccountId = restaurant.Id, FirstName = 'Test', LastName = 'Manager', Title = 'Store Manager',
            Department = 'Coastline Kitchen ' + city
        );
        return city;
    }

    // The demo org's own Case automation reads org data, so creating a Case runs with it visible.
    @IsTest(SeeAllData=true)
    static void opensOneCaseForTheStoreManagerAndReplaysSafely() {
        String caseJson = detailsFor(manager());
        String key = 'b7f7e0c2-1d9a-4f0e-9d6b-' + String.valueOf(Crypto.getRandomLong()).replace('-', '').left(12).leftPad(12, '0');
        NorthstarCreateInventoryCase.Output first = NorthstarCreateInventoryCase.run(
            new List<NorthstarCreateInventoryCase.Input>{ input(caseJson, caseJson, key) }
        )[0];
        System.assertEquals(true, first.readBack);
        System.assertEquals(false, first.replayed);
        System.assertEquals('Test Manager', first.contactName);
        System.assertEquals('High', first.priority);
        System.assertEquals(LOCATION, first.locationKey);
        Case saved = [SELECT Description, Subject FROM Case WHERE Id = :first.caseId];
        System.assert(saved.Subject.contains('Testville'), saved.Subject);
        System.assert(saved.Description.contains('Açaí packs: 40 pack on hand, 20 on order, 195.5 needed'), saved.Description);
        NorthstarCreateInventoryCase.Output replay = NorthstarCreateInventoryCase.run(
            new List<NorthstarCreateInventoryCase.Input>{ input(caseJson, caseJson, key) }
        )[0];
        System.assertEquals(true, replay.replayed);
        System.assertEquals(first.caseId, replay.caseId);
        System.assertEquals(1, [SELECT COUNT() FROM Case WHERE Northstar_Idempotency_Key__c = :key]);
    }

    @IsTest
    static void rejectsDetailsThatDoNotMatchTheConfirmedHash() {
        String confirmedJson = detailsFor(manager());
        String tampered = confirmedJson.replace('"onHand":40', '"onHand":4');
        try {
            NorthstarCreateInventoryCase.run(new List<NorthstarCreateInventoryCase.Input>{
                input(tampered, confirmedJson, 'e1d2c3b4-a596-4877-8a9b-0c1d2e3f4a5b')
            });
            System.assert(false, 'Tampered details must be rejected.');
        } catch (NorthstarCreateInventoryCase.InventoryCaseException error) {
            System.assert(error.getMessage().contains('do not match'), error.getMessage());
        }
        System.assertEquals(0, [SELECT COUNT() FROM Case]);
    }

    @IsTest
    static void checksCaseWriteAccess() {
        NorthstarCheckWriteAccess.Input check = new NorthstarCheckWriteAccess.Input();
        check.action = 'create-inventory-case';
        NorthstarCheckWriteAccess.Output result = NorthstarCheckWriteAccess.run(
            new List<NorthstarCheckWriteAccess.Input>{ check }
        )[0];
        System.assert(result.checksJson.contains('Create Case'), result.checksJson);
        System.assert(result.checksJson.contains('Read Contact'), result.checksJson);
    }
}
