@isTest
private class WebsuiteHelpRequestControllerTest {
    private static User buildUser() {
        Profile p = [SELECT Id FROM Profile WHERE Name = 'Standard User' LIMIT 1];
        User u = new User(
            Alias = 'whelp',
            Email = 'websuite.help.tester@example.com',
            EmailEncodingKey = 'UTF-8',
            LastName = 'Tester',
            LanguageLocaleKey = 'en_US',
            LocaleSidKey = 'en_US',
            ProfileId = p.Id,
            TimeZoneSidKey = 'Australia/Melbourne',
            Username = 'websuite.help.tester.' + System.now().getTime() + '@example.com.wstest'
        );
        insert u;
        PermissionSet ps = [SELECT Id FROM PermissionSet WHERE Name = 'Websuite_Command_Center' LIMIT 1];
        insert new PermissionSetAssignment(AssigneeId = u.Id, PermissionSetId = ps.Id);
        return u;
    }

    @isTest
    static void requestHelpCreatesRecordLinkedToSite() {
        User u = buildUser();
        System.runAs(u) {
            Id siteId = WebsuiteSiteController.createSite('Ruby', '{"siteId":"x"}');

            Test.startTest();
            Id reqId = WebsuiteHelpRequestController.requestHelp(
                siteId,
                '  Please polish my hero  ',
                '{"snapshot":true}',
                'preview'
            );
            Test.stopTest();

            System.assertNotEquals(null, reqId, 'Request record created');
            Website_Help_Request__c req = [
                SELECT Note__c, Config_Snapshot__c, Source__c, Site__c
                FROM Website_Help_Request__c
                WHERE Id = :reqId
            ];
            System.assertEquals('Please polish my hero', req.Note__c, 'Note trimmed and stored');
            System.assertEquals('{"snapshot":true}', req.Config_Snapshot__c, 'Snapshot stored');
            System.assertEquals('preview', req.Source__c, 'Source captured');
            System.assertEquals(siteId, req.Site__c, 'Linked to originating site');
        }
    }

    @isTest
    static void requestHelpDefaultsSourceAndAllowsNoSite() {
        User u = buildUser();
        System.runAs(u) {
            Test.startTest();
            Id reqId = WebsuiteHelpRequestController.requestHelp(null, null, '{}', 'anything-else');
            Test.stopTest();

            Website_Help_Request__c req = [
                SELECT Note__c, Source__c, Site__c FROM Website_Help_Request__c WHERE Id = :reqId
            ];
            System.assertEquals('editor', req.Source__c, 'Unknown source defaults to editor');
            System.assertEquals(null, req.Site__c, 'No site is allowed (unsaved draft)');
            System.assertEquals(null, req.Note__c, 'Blank note stored as null');
        }
    }
}