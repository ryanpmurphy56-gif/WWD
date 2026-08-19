@isTest
private class WebsuiteSiteControllerTest {
    // A user holding the Websuite Command Center permission set, so tests
    // exercise the same FLS-enforced (USER_MODE) path the editor hits at runtime.
    private static User buildUser() {
        Profile p = [SELECT Id FROM Profile WHERE Name = 'Standard User' LIMIT 1];
        User u = new User(
            Alias = 'wsite',
            Email = 'websuite.site.tester@example.com',
            EmailEncodingKey = 'UTF-8',
            LastName = 'Tester',
            LanguageLocaleKey = 'en_US',
            LocaleSidKey = 'en_US',
            ProfileId = p.Id,
            TimeZoneSidKey = 'Australia/Melbourne',
            Username = 'websuite.site.tester.' + System.now().getTime() + '@example.com.wstest'
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
    static void createSiteInsertsAndReturnsId() {
        User u = buildUser();
        System.runAs(u) {
            Test.startTest();
            Id newId = WebsuiteSiteController.createSite('Ruby\'s Diner', sampleConfig('Hi'));
            Test.stopTest();

            System.assertNotEquals(null, newId, 'New site Id returned');
            Website_Site__c saved = [SELECT Name, Config__c FROM Website_Site__c WHERE Id = :newId];
            System.assertEquals('Ruby\'s Diner', saved.Name, 'Name persisted');
            System.assert(saved.Config__c.contains('"heading":"Hi"'), 'Config JSON persisted verbatim');
        }
    }

    @isTest
    static void createSiteForAccountAttributesTheSite() {
        User u = buildUser();
        Websuite_Account__c account = new Websuite_Account__c(
            Email__c = 'owner@example.com',
            First_Name__c = 'Ada',
            Last_Name__c = 'Lovelace'
        );
        insert account;

        System.runAs(u) {
            Test.startTest();
            Id newId = WebsuiteSiteController.createSiteForAccount('Owned site', sampleConfig('Hi'), account.Id);
            Test.stopTest();

            Website_Site__c saved = [SELECT Websuite_Account__c FROM Website_Site__c WHERE Id = :newId];
            System.assertEquals(account.Id, saved.Websuite_Account__c, 'Site attributed to the logged-in account');
        }
    }

    @isTest
    static void createSiteForAccountAllowsNullAccount() {
        User u = buildUser();
        System.runAs(u) {
            Test.startTest();
            Id newId = WebsuiteSiteController.createSiteForAccount('Anonymous site', sampleConfig('Hi'), null);
            Test.stopTest();

            Website_Site__c saved = [SELECT Websuite_Account__c FROM Website_Site__c WHERE Id = :newId];
            System.assertEquals(null, saved.Websuite_Account__c, 'A logged-out create leaves the site unattributed, same as before this field existed');
        }
    }

    @isTest
    static void createSiteRejectsBlankConfig() {
        User u = buildUser();
        System.runAs(u) {
            Boolean threw = false;
            try {
                WebsuiteSiteController.createSite('No config', '   ');
            } catch (AuraHandledException e) {
                threw = true;
            }
            System.assertEquals(true, threw, 'Blank config is rejected');
        }
    }

    @isTest
    static void createSiteDefaultsBlankName() {
        User u = buildUser();
        System.runAs(u) {
            Id newId = WebsuiteSiteController.createSite('  ', sampleConfig('X'));
            Website_Site__c saved = [SELECT Name FROM Website_Site__c WHERE Id = :newId];
            System.assertEquals('Untitled site', saved.Name, 'Blank name falls back to default');
        }
    }

    @isTest
    static void saveSiteOverwritesConfigAndName() {
        User u = buildUser();
        System.runAs(u) {
            Id newId = WebsuiteSiteController.createSite('First', sampleConfig('Before'));

            Test.startTest();
            WebsuiteSiteController.saveSite(newId, 'Renamed', sampleConfig('After'));
            Test.stopTest();

            Website_Site__c reloaded = [SELECT Name, Config__c FROM Website_Site__c WHERE Id = :newId];
            System.assertEquals('Renamed', reloaded.Name, 'Name updated on save');
            System.assert(reloaded.Config__c.contains('"heading":"After"'), 'Config overwritten');
            System.assert(!reloaded.Config__c.contains('Before'), 'Old config gone');
        }
    }

    @isTest
    static void saveSiteRejectsMissingArgs() {
        User u = buildUser();
        System.runAs(u) {
            Integer threw = 0;
            try {
                WebsuiteSiteController.saveSite(null, 'x', sampleConfig('x'));
            } catch (AuraHandledException e) {
                threw++;
            }
            Id newId = WebsuiteSiteController.createSite('Has config', sampleConfig('x'));
            try {
                WebsuiteSiteController.saveSite(newId, 'x', '  ');
            } catch (AuraHandledException e) {
                threw++;
            }
            System.assertEquals(2, threw, 'Both missing-arg saves are rejected');
        }
    }

    @isTest
    static void loadSiteReturnsConfig() {
        User u = buildUser();
        System.runAs(u) {
            Id newId = WebsuiteSiteController.createSite('Loadable', sampleConfig('Loaded'));

            Test.startTest();
            WebsuiteSiteController.SiteView view = WebsuiteSiteController.loadSite(newId);
            Test.stopTest();

            System.assertEquals(newId, view.id, 'Id returned');
            System.assertEquals('Loadable', view.name, 'Name returned');
            System.assert(view.config.contains('"heading":"Loaded"'), 'Full config returned on load');
        }
    }

    @isTest
    static void loadSiteRejectsMissingRecord() {
        User u = buildUser();
        System.runAs(u) {
            Boolean threw = false;
            try {
                WebsuiteSiteController.loadSite(null);
            } catch (AuraHandledException e) {
                threw = true;
            }
            System.assertEquals(true, threw, 'Null id is rejected');
        }
    }

    @isTest
    static void getSitesListsWithoutConfigBody() {
        User u = buildUser();
        System.runAs(u) {
            WebsuiteSiteController.createSite('Alpha', sampleConfig('a'));
            WebsuiteSiteController.createSite('Bravo', sampleConfig('b'));

            Test.startTest();
            List<WebsuiteSiteController.SiteView> views = WebsuiteSiteController.getSites();
            Test.stopTest();

            System.assertEquals(2, views.size(), 'Both sites listed');
            for (WebsuiteSiteController.SiteView v : views) {
                System.assertNotEquals(null, v.name, 'List rows carry a name');
                System.assertEquals(null, v.config, 'List rows omit the heavy config body');
            }
        }
    }

    @isTest
    static void submitForReviewSetsStatusAndTimestamp() {
        User u = buildUser();
        System.runAs(u) {
            Id newId = WebsuiteSiteController.createSite('Sub', sampleConfig('Draft'));

            Test.startTest();
            WebsuiteSiteController.SubmitResult result = WebsuiteSiteController.submitForReview(newId);
            Test.stopTest();

            System.assertNotEquals(null, result.submittedAt, 'Submit timestamp returned');
            Website_Site__c site = [SELECT Is_Published__c, Review_Status__c, Submitted_At__c FROM Website_Site__c WHERE Id = :newId];
            System.assertEquals('Pending Review', site.Review_Status__c, 'Review status set to Pending Review');
            System.assertEquals(false, site.Is_Published__c, 'Submitting for review does not publish');
        }
    }

    @isTest
    static void submitForReviewRejectsMissingRecord() {
        User u = buildUser();
        System.runAs(u) {
            Boolean threw = false;
            try {
                WebsuiteSiteController.submitForReview(null);
            } catch (AuraHandledException e) {
                threw = true;
            }
            System.assertEquals(true, threw, 'Null id is rejected');
        }
    }

    @isTest
    static void getVersionHistoryReturnsNewestFirst() {
        User u = buildUser();
        System.runAs(u) {
            Id newId = WebsuiteSiteController.createSite('Hist', sampleConfig('v1'));
            WebsuiteReviewController.approveSite(newId, 'example.com', 'ok');
            WebsuiteSiteController.saveSite(newId, 'Hist', sampleConfig('v2'));
            WebsuiteReviewController.approveSite(newId, 'example.com', 'ok');

            Test.startTest();
            List<WebsuiteSiteController.VersionView> views = WebsuiteSiteController.getVersionHistory(newId);
            Test.stopTest();

            System.assertEquals(2, views.size(), 'Both publishes recorded');
            System.assert(views[0].publishedAt >= views[1].publishedAt, 'Newest first');
        }
    }

    @isTest
    static void restoreVersionWritesSnapshotBackToDraft() {
        User u = buildUser();
        System.runAs(u) {
            Id newId = WebsuiteSiteController.createSite('Restore', sampleConfig('v1'));
            WebsuiteReviewController.approveSite(newId, 'example.com', 'ok');
            WebsuiteSiteController.saveSite(newId, 'Restore', sampleConfig('v2'));
            List<WebsuiteSiteController.VersionView> versions = WebsuiteSiteController.getVersionHistory(newId);

            Test.startTest();
            String restored = WebsuiteSiteController.restoreVersion(newId, versions[0].id);
            Test.stopTest();

            System.assert(restored.contains('"heading":"v1"'), 'v1 snapshot returned');
            Website_Site__c site = [SELECT Config__c FROM Website_Site__c WHERE Id = :newId];
            System.assert(site.Config__c.contains('"heading":"v1"'), 'Draft rolled back to v1');
        }
    }

    @isTest
    static void restoreVersionRejectsVersionFromAnotherSite() {
        User u = buildUser();
        System.runAs(u) {
            Id siteA = WebsuiteSiteController.createSite('A', sampleConfig('a'));
            WebsuiteReviewController.approveSite(siteA, 'example.com', 'ok');
            Id versionA = WebsuiteSiteController.getVersionHistory(siteA)[0].id;
            Id siteB = WebsuiteSiteController.createSite('B', sampleConfig('b'));

            Boolean threw = false;
            try {
                WebsuiteSiteController.restoreVersion(siteB, versionA);
            } catch (AuraHandledException e) {
                threw = true;
            }
            System.assertEquals(true, threw, 'Cross-site version restore is rejected');
        }
    }

    @isTest
    static void getPublishedSiteRejectsUnpublished() {
        User u = buildUser();
        System.runAs(u) {
            Id newId = WebsuiteSiteController.createSite('Draft only', sampleConfig('x'));
            Boolean threw = false;
            try {
                WebsuiteSiteController.getPublishedSite(newId);
            } catch (AuraHandledException e) {
                threw = true;
            }
            System.assertEquals(true, threw, 'Unpublished site is refused');
        }
    }

    @isTest
    static void getPublishedSiteReturnsSnapshotAfterPublish() {
        User u = buildUser();
        System.runAs(u) {
            Id newId = WebsuiteSiteController.createSite('Live', sampleConfig('Published copy'));
            WebsuiteReviewController.approveSite(newId, 'example.com', 'ok');

            Test.startTest();
            WebsuiteSiteController.SiteView view = WebsuiteSiteController.getPublishedSite(newId);
            Test.stopTest();

            System.assertEquals(true, view.isPublished, 'Marked published');
            System.assert(view.config.contains('"heading":"Published copy"'), 'Published config returned');
        }
    }
}