@isTest
private class WebsuiteFormControllerTest {
    @isTest
    static void submitFormStoresPayloadAndLinksSite() {
        Website_Site__c site = new Website_Site__c(Name = 'S', Config__c = '{}');
        insert site;
        String payload = '{"Your name":"Ada","Your email":"ada@example.com","Your message":"Hi"}';

        Test.startTest();
        Id subId = WebsuiteFormController.submitForm(site.Id, 'Get in touch', payload, null);
        Test.stopTest();

        Website_Form_Submission__c sub = [
            SELECT Site__c, Form_Name__c, Payload__c FROM Website_Form_Submission__c WHERE Id = :subId
        ];
        System.assertEquals(site.Id, sub.Site__c, 'Linked to the site');
        System.assertEquals('Get in touch', sub.Form_Name__c, 'Form name kept');
        System.assertEquals(payload, sub.Payload__c, 'Payload stored verbatim');
    }

    @isTest
    static void getSubmissionsReturnsNewestFirstForTheSite() {
        Website_Site__c site = new Website_Site__c(Name = 'S', Config__c = '{}');
        insert site;
        Website_Site__c otherSite = new Website_Site__c(Name = 'Other', Config__c = '{}');
        insert otherSite;

        insert new List<Website_Form_Submission__c>{
            new Website_Form_Submission__c(Site__c = site.Id, Form_Name__c = 'First', Payload__c = '{"a":"1"}'),
            new Website_Form_Submission__c(Site__c = site.Id, Form_Name__c = 'Second', Payload__c = '{"a":"2"}'),
            new Website_Form_Submission__c(Site__c = otherSite.Id, Form_Name__c = 'Not this site', Payload__c = '{"a":"3"}')
        };

        Test.startTest();
        List<Website_Form_Submission__c> rows = WebsuiteFormController.getSubmissions(site.Id);
        Test.stopTest();

        System.assertEquals(2, rows.size(), 'Only this site\'s submissions come back');
        System.assertEquals('Second', rows[0].Form_Name__c, 'Newest first');
    }

    @isTest
    static void getSubmissionsReturnsEmptyForBlankSiteId() {
        List<Website_Form_Submission__c> rows = WebsuiteFormController.getSubmissions(null);
        System.assertEquals(0, rows.size(), 'No siteId (unsaved draft) yields an empty list, not a query error');
    }

    @isTest
    static void submitFormWorksWithoutSite() {
        Id subId = WebsuiteFormController.submitForm(null, null, '{"a":"b"}', null);
        System.assertNotEquals(null, subId, 'Unsaved drafts can still submit');
    }

    @isTest
    static void submitFormRejectsBlankPayload() {
        Boolean threw = false;
        try {
            WebsuiteFormController.submitForm(null, 'x', '  ', null);
        } catch (AuraHandledException e) {
            threw = true;
        }
        System.assertEquals(true, threw, 'Blank payload rejected');
    }

    @isTest
    static void submitFormRejectsOversizedPayload() {
        Boolean threw = false;
        try {
            WebsuiteFormController.submitForm(null, 'x', '{"a":"' + 'y'.repeat(32001) + '"}', null);
        } catch (AuraHandledException e) {
            threw = true;
        }
        System.assertEquals(true, threw, 'Oversized payload rejected');
    }

    // Limits.getEmailInvocations() must be read on both sides of the call
    // inside the same Test.startTest()/stopTest() block — that block gets its
    // own fresh governor context, and reading the limit again after
    // stopTest() reverts to the outer context's (unrelated) count.
    @isTest
    static void submitFormSendsNotificationWhenEmailProvided() {
        Test.startTest();
        Integer before = Limits.getEmailInvocations();
        Id subId = WebsuiteFormController.submitForm(null, 'Get in touch', '{"a":"b"}', 'owner@example.com');
        Integer after = Limits.getEmailInvocations();
        Test.stopTest();

        System.assertNotEquals(null, subId, 'Submission still stored');
        System.assertEquals(before + 1, after, 'One notification email attempted');
    }

    @isTest
    static void submitFormSendsOneNotificationForMultipleAddresses() {
        Test.startTest();
        Integer before = Limits.getEmailInvocations();
        WebsuiteFormController.submitForm(null, 'x', '{"a":"b"}', 'owner@example.com, second@example.com');
        Integer after = Limits.getEmailInvocations();
        Test.stopTest();

        System.assertEquals(before + 1, after, 'Both recipients sent in a single message');
    }

    @isTest
    static void submitFormSkipsNotificationWhenEmailBlank() {
        Test.startTest();
        Integer before = Limits.getEmailInvocations();
        Id subId = WebsuiteFormController.submitForm(null, 'x', '{"a":"b"}', '');
        Integer after = Limits.getEmailInvocations();
        Test.stopTest();

        System.assertNotEquals(null, subId, 'Submission still stored');
        System.assertEquals(before, after, 'No email attempted without an address');
    }

    @isTest
    static void submitFormIgnoresInvalidNotifyEmail() {
        Test.startTest();
        Integer before = Limits.getEmailInvocations();
        Id subId = WebsuiteFormController.submitForm(null, 'x', '{"a":"b"}', 'not-an-email');
        Integer after = Limits.getEmailInvocations();
        Test.stopTest();

        System.assertNotEquals(null, subId, 'Malformed notify address never blocks the submission');
        System.assertEquals(before, after, 'Invalid address is skipped, not sent to');
    }

    @isTest
    static void submitFormNotificationHandlesArrayAnswers() {
        // Checkbox fields submit their selections as a JSON array — the
        // notification body must format that without throwing.
        Boolean threw = false;
        Test.startTest();
        try {
            WebsuiteFormController.submitForm(null, 'x', '{"Interests":["Blog","Newsletter"]}', 'owner@example.com');
        } catch (Exception e) {
            threw = true;
        }
        Test.stopTest();

        System.assertEquals(false, threw, 'Array-valued answers do not break notification formatting');
    }
}