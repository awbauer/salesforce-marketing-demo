public with sharing class NorthstarGetConsentSummary {
    public class Input {
        @InvocableVariable(required=true label='Campaign ID') public Id campaignId;
    }
    public class Output {
        @InvocableVariable(label='Consent Passed') public Boolean passed;
        @InvocableVariable(label='Eligible Sample Profiles') public Integer eligibleCount;
        @InvocableVariable(label='Consent Blocker') public String blocker;
    }

    @InvocableMethod(label='Get Audience and Consent Summary' description='Returns aggregate consent evidence without customer-level fields.')
    public static List<Output> run(List<Input> inputs) {
        Integer aggregateConsentCount = 0;
        if (Schema.getGlobalDescribe().containsKey('ContactPointTypeConsent')) {
            List<AggregateResult> counts = Database.queryWithBinds(
                'SELECT COUNT(Id) total FROM ContactPointTypeConsent WHERE PrivacyConsentStatus = :status',
                new Map<String, Object>{ 'status' => 'OptIn' },
                AccessLevel.USER_MODE
            );
            if (!counts.isEmpty()) aggregateConsentCount = Integer.valueOf(String.valueOf(counts[0].get('total')));
        }
        List<Output> results = new List<Output>();
        for (Input ignored : inputs) {
            Output result = new Output();
            result.eligibleCount = aggregateConsentCount;
            result.passed = aggregateConsentCount > 0;
            result.blocker = result.passed ? null : 'No eligible sample consent records were available to the evaluator.';
            results.add(result);
        }
        return results;
    }
}
