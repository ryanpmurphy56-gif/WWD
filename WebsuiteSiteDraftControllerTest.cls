@isTest
private class WebsuiteSiteDraftControllerTest {
    @isTest
    static void saveDraftInsertsNewRecord() {
        Test.startTest();
        WebsuiteSiteDraftController.saveDraft('tok-1', '{"businessName":"Acme"}', 'Acme');
        Test.stopTest();

        Websuite_Site_Draft__c saved = [
            SELECT Draft_Token__c, Draft_Payload__c, Draft_Business_Name__c, Name
            FROM Websuite_Site_Draft__c
            WHERE Draft_Token__c = 'tok-1'
        ];
        System.assertEquals('{"businessName":"Acme"}', saved.Draft_Payload__c, 'Draft JSON saved');
        System.assertEquals('Acme', saved.Draft_Business_Name__c, 'Business name saved');
        System.assertEquals('Acme', saved.Name, 'Name mirrors business name');
    }

    @isTest
    static void saveDraftUpdatesExistingRecordByToken() {
        WebsuiteSiteDraftController.saveDraft('tok-2', '{"step":1}', 'Bravo');

        Test.startTest();
        WebsuiteSiteDraftController.saveDraft('tok-2', '{"step":2}', 'Bravo');
        Test.stopTest();

        List<Websuite_Site_Draft__c> rows = [
            SELECT Draft_Payload__c FROM Websuite_Site_Draft__c WHERE Draft_Token__c = 'tok-2'
        ];
        System.assertEquals(1, rows.size(), 'Same token upserts in place, no duplicate');
        System.assertEquals('{"step":2}', rows[0].Draft_Payload__c, 'Latest JSON persisted');
    }

    @isTest
    static void saveDraftDefaultsNameWhenBusinessNameBlank() {
        Test.startTest();
        WebsuiteSiteDraftController.saveDraft('tok-3', '{}', null);
        Test.stopTest();

        Websuite_Site_Draft__c saved = [
            SELECT Name, Draft_Business_Name__c FROM Websuite_Site_Draft__c WHERE Draft_Token__c = 'tok-3'
        ];
        System.assertEquals('Untitled draft', saved.Name, 'Falls back to a default name');
        System.assertEquals(null, saved.Draft_Business_Name__c, 'Blank business name stored as null');
    }

    @isTest
    static void saveDraftRejectsBlankToken() {
        Boolean threw = false;
        try {
            WebsuiteSiteDraftController.saveDraft('  ', '{}', 'Charlie');
        } catch (AuraHandledException e) {
            threw = true;
        }
        System.assertEquals(true, threw, 'Blank token is rejected');
    }

    @isTest
    static void getDraftReturnsNullForBlankToken() {
        System.assertEquals(null, WebsuiteSiteDraftController.getDraft(null), 'Null token returns null');
        System.assertEquals(null, WebsuiteSiteDraftController.getDraft('   '), 'Blank token returns null');
    }

    @isTest
    static void getDraftReturnsNullWhenNotFound() {
        System.assertEquals(null, WebsuiteSiteDraftController.getDraft('does-not-exist'), 'Unknown token returns null');
    }

    @isTest
    static void getDraftReturnsSavedJson() {
        WebsuiteSiteDraftController.saveDraft('tok-4', '{"pages":[]}', 'Delta');

        Test.startTest();
        String json = WebsuiteSiteDraftController.getDraft('tok-4');
        Test.stopTest();

        System.assertEquals('{"pages":[]}', json, 'Saved JSON round-trips');
    }

    // Standard User has no CRUD on this custom object without an explicit
    // grant, mirroring how the site's Guest User Profile must be granted
    // access in Setup before the public editor can actually save.
    @isTest
    static void saveDraftRejectsUserWithoutObjectAccess() {
        Profile p = [SELECT Id FROM Profile WHERE Name = 'Standard User' LIMIT 1];
        User u = new User(
            Alias = 'wsdraft',
            Email = 'websuite.draft.tester@example.com',
            EmailEncodingKey = 'UTF-8',
            LastName = 'Tester',
            LanguageLocaleKey = 'en_US',
            LocaleSidKey = 'en_US',
            ProfileId = p.Id,
            TimeZoneSidKey = 'Australia/Melbourne',
            Username = 'websuite.draft.tester.' + System.now().getTime() + '@example.com.wstest'
        );
        insert u;

        System.runAs(u) {
            Boolean threw = false;
            try {
                WebsuiteSiteDraftController.saveDraft('tok-5', '{}', 'Echo');
            } catch (AuraHandledException e) {
                threw = true;
            }
            System.assertEquals(true, threw, 'User without object access is rejected');
        }
    }
}