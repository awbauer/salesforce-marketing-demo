@IsTest
private class NorthstarMarketingAgentTest {
    private static User evaluator() {
        String unique = String.valueOf(DateTime.now().getTime()) + String.valueOf(Crypto.getRandomInteger()).replace('-', '');
        User user = new User(
            Alias = 'nsmkt',
            Email = 'northstar-marketing+' + unique + '@example.invalid',
            EmailEncodingKey = 'UTF-8',
            LastName = 'Northstar Marketing',
            LanguageLocaleKey = 'en_US',
            LocaleSidKey = 'en_US',
            ProfileId = UserInfo.getProfileId(),
            TimeZoneSidKey = 'America/New_York',
            Username = 'northstar-marketing+' + unique + '@example.invalid',
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

    @IsTest
    static void checksAgentWritesAsTheUser() {
        Brief brief = new Brief(Name = 'Coastline rainy-day lunch', KeyMessage = 'Soup is on.');
        insert brief;
        NorthstarCheckWriteAccess.Input saveBrief = new NorthstarCheckWriteAccess.Input();
        saveBrief.action = 'save-marketing-brief';
        NorthstarCheckWriteAccess.Input createCampaign = new NorthstarCheckWriteAccess.Input();
        createCampaign.action = 'create-marketing-campaign';
        createCampaign.recordId = brief.Id;
        NorthstarCheckWriteAccess.Input retired = new NorthstarCheckWriteAccess.Input();
        retired.action = 'save-message';
        List<NorthstarCheckWriteAccess.Output> results = NorthstarCheckWriteAccess.run(
            new List<NorthstarCheckWriteAccess.Input>{ saveBrief, createCampaign, retired }
        );
        System.assert(results[0].checksJson.contains('Brief'), results[0].checksJson);
        System.assert(results[1].checksJson.contains('Create Campaign'), results[1].checksJson);
        System.assert(results[1].checksJson.contains('Marketing User'), results[1].checksJson);
        System.assert(results[1].checksJson.contains('Edit this brief'), results[1].checksJson);
        System.assertEquals(false, results[2].allowed, 'Retired custom writes are no longer known actions.');
    }

    @IsTest
    static void readsBackTheBriefStepsCampaignAndFlow() {
        User user = evaluator();
        Brief brief;
        System.runAs(new User(Id = UserInfo.getUserId())) {
            brief = new Brief(
                Name = 'Coastline rainy-day lunch',
                KeyMessage = 'Soup is on.',
                TargetAudience = 'Los Angeles app users'
            );
            insert brief;
            insert new BriefPlanStep(
                BriefId = brief.Id, Name = 'Email 1', StepNumber = 1, StepType = 'Message',
                Channel = 'EMAIL', Content = '{"subjectLine":"Soup is on"}'
            );
            insert new Campaign(Name = 'Rainy Day Comfort', BriefId = brief.Id, Status = 'Planned');
        }
        NorthstarGetMarketingRecords.Input byId = new NorthstarGetMarketingRecords.Input();
        byId.briefId = brief.Id;
        NorthstarGetMarketingRecords.Input missing = new NorthstarGetMarketingRecords.Input();
        missing.briefName = 'No such brief';
        List<NorthstarGetMarketingRecords.Output> results = NorthstarGetMarketingRecords.run(
            new List<NorthstarGetMarketingRecords.Input>{ byId, missing }
        );
        System.assertEquals(true, results[0].found);
        System.assertEquals(true, results[0].readBack);
        Map<String, Object> records = (Map<String, Object>) JSON.deserializeUntyped(results[0].recordsJson);
        System.assertEquals('Coastline rainy-day lunch', ((Map<String, Object>) records.get('brief')).get('name'));
        System.assertEquals(1, ((List<Object>) records.get('steps')).size());
        System.assertEquals('Rainy Day Comfort', ((Map<String, Object>) records.get('campaign')).get('name'));
        System.assertEquals(false, results[1].found);
        System.runAs(user) {
            NorthstarGetMarketingRecords.Input byName = new NorthstarGetMarketingRecords.Input();
            byName.briefName = 'Coastline rainy-day lunch';
            // The name lookup only returns briefs the caller created.
            System.assertEquals(false, NorthstarGetMarketingRecords.run(
                new List<NorthstarGetMarketingRecords.Input>{ byName }
            )[0].found);
        }
    }
}
