@isTest
private class WebsuiteReviewControllerTest {
    // Same permission set the editor's own tests run as — see
    // WebsuiteSiteControllerTest for why (USER_MODE-enforced path).
    private static User buildUser() {
        Profile p = [SELECT Id FROM Profile WHERE Name = 'Standard User' LIMIT 1];
        User u = new User(
            Alias = 'wrevu',
            Email = 'websuite.review.tester@example.com',
            EmailEncodingKey = 'UTF-8',
            LastName = 'Tester',
            LanguageLocaleKey = 'en_US',
            LocaleSidKey = 'en_US',
            ProfileId = p.Id,
            TimeZoneSidKey = 'Australia/Melbourne',
            Username = 'websuite.review.tester.' + System.now().getTime() + '@example.com.wstest'
        );
        insert u;
        PermissionSet ps = [SELECT Id FROM PermissionSet WHERE Name = 'Websuite_Command_Center' LIMIT 1];
        insert new PermissionSetAssignment(AssigneeId = u.Id, PermissionSetId = ps.Id);
        return u;
    }

    private static String sampleConfig(String heading) {
        return '{"siteId":"abc","meta":{"businessName":"Ruby\'s"},' +
            '"pages":[{"pageId":"p1","sections":[{"sectionId":"s1","type":"hero",' +
            '"content":{"heading":"' + heading + '"}}]}]}';
    }

    @isTest
    static void getPendingReviewListsOnlySubmittedSites() {
        User u = buildUser();
        System.runAs(u) {
            Id submitted = WebsuiteSiteController.createSite('Submitted', sampleConfig('a'));
            WebsuiteSiteController.submitForReview(submitted);
            WebsuiteSiteController.createSite('Still draft', sampleConfig('b'));

            Test.startTest();
            List<WebsuiteReviewController.ReviewQueueItem> items = WebsuiteReviewController.getPendingReview();
            Test.stopTest();

            System.assertEquals(1, items.size(), 'Only the submitted site appears');
            System.assertEquals(submitted, items[0].id, 'Submitted site is in the queue');
        }
    }

    @isTest
    static void getSiteForReviewReturnsDraftConfigRegardlessOfPublishState() {
        User u = buildUser();
        System.runAs(u) {
            Id newId = WebsuiteSiteController.createSite('Review me', sampleConfig('Draft copy'));
            WebsuiteSiteController.submitForReview(newId);

            Test.startTest();
            WebsuiteReviewController.ReviewSiteView view = WebsuiteReviewController.getSiteForReview(newId);
            Test.stopTest();

            System.assertEquals('Pending Review', view.reviewStatus, 'Review status returned');
            System.assert(view.config.contains('"heading":"Draft copy"'), 'Draft config returned for review');
        }
    }

    @isTest
    static void approveSiteCopiesConfigSnapshotsVersionAndResetsReviewStatus() {
        User u = buildUser();
        System.runAs(u) {
            Id newId = WebsuiteSiteController.createSite('Approve me', sampleConfig('Live'));
            WebsuiteSiteController.submitForReview(newId);

            Test.startTest();
            WebsuiteReviewController.PublishResult result = WebsuiteReviewController.approveSite(newId, 'example.com', 'Looks good');
            Test.stopTest();

            System.assertNotEquals(null, result.publishedAt, 'Publish timestamp returned');
            Website_Site__c site = [
                SELECT Is_Published__c, Config__c, Published_Config__c, Domain__c, Review_Status__c, Review_Notes__c, Reviewed_By__c
                FROM Website_Site__c
                WHERE Id = :newId
            ];
            System.assertEquals(true, site.Is_Published__c, 'Flag set');
            System.assertEquals(site.Config__c, site.Published_Config__c, 'Published config matches draft at approval time');
            System.assertEquals('example.com', site.Domain__c, 'Domain recorded');
            System.assertEquals('Not Submitted', site.Review_Status__c, 'Review status reset after approval');
            System.assertEquals(u.Id, site.Reviewed_By__c, 'Reviewer recorded');

            List<Website_Site_Version__c> versions = [SELECT Snapshot_Config__c FROM Website_Site_Version__c WHERE Website_Site__c = :newId];
            System.assertEquals(1, versions.size(), 'One version snapshot created');
        }
    }

    @isTest
    static void approveSiteRejectsMissingRecord() {
        User u = buildUser();
        System.runAs(u) {
            Boolean threw = false;
            try {
                WebsuiteReviewController.approveSite(null, 'example.com', 'ok');
            } catch (AuraHandledException e) {
                threw = true;
            }
            System.assertEquals(true, threw, 'Null id is rejected');
        }
    }

    @isTest
    static void rejectSiteSetsChangesRequestedAndLeavesLiveVersionUntouched() {
        User u = buildUser();
        System.runAs(u) {
            Id newId = WebsuiteSiteController.createSite('Live then edited', sampleConfig('Live copy'));
            WebsuiteSiteController.submitForReview(newId);
            WebsuiteReviewController.approveSite(newId, 'example.com', 'ok');

            // A further edit gets submitted again, but this time it's rejected.
            WebsuiteSiteController.saveSite(newId, 'Live then edited', sampleConfig('Rejected draft'));
            WebsuiteSiteController.submitForReview(newId);

            Test.startTest();
            WebsuiteReviewController.rejectSite(newId, 'Fix the hero image');
            Test.stopTest();

            Website_Site__c site = [
                SELECT Is_Published__c, Published_Config__c, Review_Status__c, Review_Notes__c
                FROM Website_Site__c
                WHERE Id = :newId
            ];
            System.assertEquals('Changes Requested', site.Review_Status__c, 'Review status set to Changes Requested');
            System.assertEquals('Fix the hero image', site.Review_Notes__c, 'Rejection note recorded');
            System.assertEquals(true, site.Is_Published__c, 'Site stays live on its last-approved version');
            System.assert(site.Published_Config__c.contains('"heading":"Live copy"'), 'Published copy untouched by the rejected draft');
        }
    }
}
