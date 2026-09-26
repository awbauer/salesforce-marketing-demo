@IsTest
private class NorthstarRecordActionsTest {
    private static final String SIGNING_KEY = 'unit-test-key';
    private static final String REQUEST_HASH = 'a3f04f3e0d6fa85ae69f5572214a939f20f781593642e73d870647c25b32f2f0';

    private static String sign(String action, String subject, String idempotencyKey) {
        String confirmationId = '0f7b8de9-0a5c-4d94-aa9c-f24f2b2a93c3';
        Long expiresAt = DateTime.now().addMinutes(4).getTime() / 1000;
        String canonical = String.join(new List<String>{
            action, subject, confirmationId, REQUEST_HASH, idempotencyKey,
            String.valueOf(expiresAt), 'test-evaluator'
        }, '\n');
        String signature = EncodingUtil.convertToHex(Crypto.generateMac(
            'HmacSHA256', Blob.valueOf(canonical), Blob.valueOf(SIGNING_KEY)
        )).toLowerCase();
        return String.join(new List<String>{
            'v1', confirmationId, String.valueOf(expiresAt),
            EncodingUtil.convertToHex(Blob.valueOf('test-evaluator')).toLowerCase(), signature
        }, '.');
    }

    private static User evaluator() {
        String unique = String.valueOf(DateTime.now().getTime()) + String.valueOf(Crypto.getRandomInteger()).replace('-', '');
        User user = new User(
            Alias = 'nsrec',
            Email = 'northstar-records+' + unique + '@example.invalid',
            EmailEncodingKey = 'UTF-8',
            LastName = 'Northstar Records',
            LanguageLocaleKey = 'en_US',
            LocaleSidKey = 'en_US',
            ProfileId = UserInfo.getProfileId(),
            TimeZoneSidKey = 'America/New_York',
            Username = 'northstar-records+' + unique + '@example.invalid',
            UserPermissionsMarketingUser = true
        );
        System.runAs(new User(Id = UserInfo.getUserId())) {
            insert user;
            insert new PermissionSetAssignment(
                AssigneeId = user.Id,
                PermissionSetId = [SELECT Id FROM PermissionSet WHERE Name = 'Northstar_Marketing_Workbench_Evaluator' LIMIT 1].Id
            );
        }
        return user;
    }

    @TestSetup
    static void setup() {
        insert new Northstar_Confirmation_Config__c(
            SetupOwnerId = UserInfo.getOrganizationId(),
            Signing_Key__c = SIGNING_KEY
        );
        insert new Campaign(Name = 'Northstar Fall Loyalty Reactivation', Status = 'Planned');
    }

    @IsTest
    static void createsUpdatesAndReplaysACampaign() {
        System.runAs(evaluator()) {
            NorthstarSaveCampaign.Input create = new NorthstarSaveCampaign.Input();
            create.name = 'Coastline Weather Moments';
            create.brand = 'Coastline Kitchen';
            create.description = 'Weather-aware mobile app pushes.';
            create.idempotencyKey = '11111111-1111-4111-8111-111111111111';
            create.requestHash = REQUEST_HASH;
            create.confirmationId = sign('save-campaign', 'new', create.idempotencyKey);
            Test.startTest();
            NorthstarSaveCampaign.Output first = NorthstarSaveCampaign.run(new List<NorthstarSaveCampaign.Input>{ create })[0];
            NorthstarSaveCampaign.Output replay = NorthstarSaveCampaign.run(new List<NorthstarSaveCampaign.Input>{ create })[0];

            NorthstarSaveCampaign.Input rename = new NorthstarSaveCampaign.Input();
            rename.campaignId = first.campaignId;
            rename.name = 'Coastline Weather Moments v2';
            rename.idempotencyKey = '22222222-2222-4222-8222-222222222222';
            rename.requestHash = REQUEST_HASH;
            rename.confirmationId = sign('save-campaign', String.valueOf(first.campaignId), rename.idempotencyKey);
            NorthstarSaveCampaign.Output updated = NorthstarSaveCampaign.run(new List<NorthstarSaveCampaign.Input>{ rename })[0];
            Test.stopTest();

            System.assertEquals(true, first.created);
            System.assertEquals(true, first.readBack);
            System.assertEquals(true, replay.replayed);
            System.assertEquals(first.campaignId, replay.campaignId);
            System.assertEquals(false, updated.created);
            System.assertEquals('Coastline Weather Moments v2', updated.name);
            System.assertEquals('Coastline Kitchen', [SELECT Northstar_Brand__c FROM Campaign WHERE Id = :first.campaignId].Northstar_Brand__c);
        }
    }

    @IsTest
    static void savesABriefWithANewCampaignThenUpdatesIt() {
        System.runAs(evaluator()) {
            NorthstarSaveBrief.Input input = new NorthstarSaveBrief.Input();
            input.newCampaignName = 'Coastline Morning Fuel';
            input.brand = 'Coastline Kitchen';
            input.title = 'Morning Fuel brief';
            input.objective = 'Grow weekday breakfast orders';
            input.body = 'Objective: grow weekday breakfast orders.';
            input.draftFields = '[{"label":"Objective","value":"Grow weekday breakfast orders"}]';
            input.draftId = 'focus-1';
            input.draftVersion = 1;
            input.idempotencyKey = '33333333-3333-4333-8333-333333333333';
            input.requestHash = REQUEST_HASH;
            input.confirmationId = sign('save-brief', 'new', input.idempotencyKey);
            Test.startTest();
            NorthstarSaveBrief.Output first = NorthstarSaveBrief.run(new List<NorthstarSaveBrief.Input>{ input })[0];
            NorthstarSaveBrief.Input revise = new NorthstarSaveBrief.Input();
            revise.briefId = first.briefId;
            revise.title = 'Morning Fuel brief';
            revise.body = 'Objective: grow weekday breakfast orders by 10%.';
            revise.draftVersion = 2;
            revise.idempotencyKey = '44444444-4444-4444-8444-444444444444';
            revise.requestHash = REQUEST_HASH;
            revise.confirmationId = sign('save-brief', String.valueOf(first.briefId), revise.idempotencyKey);
            NorthstarSaveBrief.Output second = NorthstarSaveBrief.run(new List<NorthstarSaveBrief.Input>{ revise })[0];
            Test.stopTest();

            System.assertEquals(true, first.created);
            System.assertEquals(true, first.campaignCreated);
            System.assertEquals('Coastline Morning Fuel', [SELECT Name FROM Campaign WHERE Id = :first.campaignId].Name);
            System.assertEquals(false, second.created);
            System.assertEquals(first.briefId, second.briefId);
            Northstar_Brief__c saved = [SELECT Body__c, Draft_Version__c FROM Northstar_Brief__c WHERE Id = :first.briefId];
            System.assertEquals(2, saved.Draft_Version__c);
            System.assert(saved.Body__c.contains('10%'));
        }
    }

    @IsTest
    static void savesAMessageOnAnExistingCampaignAndReplaysSafely() {
        Campaign campaign = [SELECT Id FROM Campaign LIMIT 1];
        System.runAs(evaluator()) {
            NorthstarSaveMessage.Input input = new NorthstarSaveMessage.Input();
            input.campaignId = campaign.Id;
            input.title = 'Fall welcome back email';
            input.channel = 'Email';
            input.subject = 'We saved your spot';
            input.preheader = 'Members-only picks inside';
            input.body = 'Welcome back to Northstar.';
            input.sendTime = 'Tuesday 9 a.m.';
            input.audience = 'Dormant loyalty members';
            input.idempotencyKey = '55555555-5555-4555-8555-555555555555';
            input.requestHash = REQUEST_HASH;
            input.confirmationId = sign('save-message', String.valueOf(campaign.Id), input.idempotencyKey);
            Test.startTest();
            NorthstarSaveMessage.Output first = NorthstarSaveMessage.run(new List<NorthstarSaveMessage.Input>{ input })[0];
            NorthstarSaveMessage.Output replay = NorthstarSaveMessage.run(new List<NorthstarSaveMessage.Input>{ input })[0];
            Test.stopTest();
            System.assertEquals(true, first.created);
            System.assertEquals(false, first.campaignCreated);
            System.assertEquals(campaign.Id, first.campaignId);
            System.assertEquals('Draft', first.status);
            System.assertEquals(true, replay.replayed);
            System.assertEquals(1, [SELECT COUNT() FROM Northstar_Message__c WHERE Campaign__c = :campaign.Id]);
        }
    }

    @IsTest
    static void refusesUnsignedWritesAndUnknownChannels() {
        System.runAs(evaluator()) {
            NorthstarSaveMessage.Input input = new NorthstarSaveMessage.Input();
            input.newCampaignName = 'Should not exist';
            input.title = 'Unsigned';
            input.channel = 'Email';
            input.body = 'Body';
            input.idempotencyKey = '66666666-6666-4666-8666-666666666666';
            input.requestHash = REQUEST_HASH;
            input.confirmationId = sign('save-message', 'some-other-subject', input.idempotencyKey);
            Boolean refused = false;
            try {
                NorthstarSaveMessage.run(new List<NorthstarSaveMessage.Input>{ input });
            } catch (NorthstarRecordWrites.WriteException error) {
                refused = true;
            }
            System.assert(refused);
            input.channel = 'Fax';
            refused = false;
            try {
                NorthstarSaveMessage.run(new List<NorthstarSaveMessage.Input>{ input });
            } catch (NorthstarRecordWrites.WriteException error) {
                refused = true;
            }
            System.assert(refused);
            System.assertEquals(0, [SELECT COUNT() FROM Campaign WHERE Name = 'Should not exist']);
            System.assertEquals(0, [SELECT COUNT() FROM Northstar_Message__c]);
        }
    }

    @IsTest
    static void describesSubjects() {
        Campaign campaign = [SELECT Id FROM Campaign LIMIT 1];
        System.assertEquals('new', NorthstarRecordWrites.subject(null, null));
        System.assertEquals(String.valueOf(campaign.Id), NorthstarRecordWrites.subject(null, campaign.Id));
        System.assertEquals(null, NorthstarRecordWrites.bounded(null, 5));
        System.assertEquals('abcde', NorthstarRecordWrites.bounded('abcdefgh', 5));
    }

    @IsTest
    static void checksWriteAccessAsTheUser() {
        Campaign campaign = [SELECT Id FROM Campaign LIMIT 1];
        System.runAs(evaluator()) {
            NorthstarCheckWriteAccess.Input create = new NorthstarCheckWriteAccess.Input();
            create.action = 'save-message';
            create.createsCampaign = true;
            NorthstarCheckWriteAccess.Input edit = new NorthstarCheckWriteAccess.Input();
            edit.action = 'save-campaign';
            edit.recordId = campaign.Id;
            NorthstarCheckWriteAccess.Input unknown = new NorthstarCheckWriteAccess.Input();
            unknown.action = 'publish';
            List<NorthstarCheckWriteAccess.Output> results = NorthstarCheckWriteAccess.run(
                new List<NorthstarCheckWriteAccess.Input>{ create, edit, unknown }
            );
            System.assertEquals(true, results[0].allowed, results[0].checksJson);
            System.assert(results[0].checksJson.contains('Create Northstar Message'));
            System.assert(results[0].checksJson.contains('Marketing User'));
            System.assert(results[1].checksJson.contains('Edit this record'));
            System.assertEquals(false, results[2].allowed);
        }
    }
}
