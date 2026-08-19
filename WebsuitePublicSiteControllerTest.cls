@isTest
private class WebsuitePublicSiteControllerTest {
    private static User buildUser() {
        Profile p = [SELECT Id FROM Profile WHERE Name = 'Standard User' LIMIT 1];
        User u = new User(
            Alias = 'wpsite',
            Email = 'websuite.public.tester@example.com',
            EmailEncodingKey = 'UTF-8',
            LastName = 'Tester',
            LanguageLocaleKey = 'en_US',
            LocaleSidKey = 'en_US',
            ProfileId = p.Id,
            TimeZoneSidKey = 'Australia/Melbourne',
            Username = 'websuite.public.tester.' + System.now().getTime() + '@example.com.wstest'
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
    static void getPublishedSiteReturnsConfigWhenPublished() {
        User u = buildUser();
        Id newId;
        System.runAs(u) {
            newId = WebsuiteSiteController.createSite('Public site', sampleConfig('Live'));
            WebsuiteReviewController.approveSite(newId, 'example.com', 'ok');
        }

        Test.startTest();
        WebsuitePublicSiteController.PublicSiteView view = WebsuitePublicSiteController.getPublishedSite(newId);
        Test.stopTest();

        System.assertEquals(true, view.isPublished, 'Published site reports isPublished true');
        System.assert(view.config.contains('"heading":"Live"'), 'Published config body returned');
        System.assertNotEquals(null, view.publishedAt, 'Published timestamp returned');
        System.assertEquals(newId, view.siteId, 'Resolved record Id returned alongside the config');
        System.assertEquals('public-site', view.siteSlug, 'createSite() slugified the business name');
    }

    // G1b — the same published site resolves by its slug, not just its Id,
    // and the two lookups return the identical view.
    @isTest
    static void getPublishedSiteResolvesBySlug() {
        User u = buildUser();
        Id newId;
        System.runAs(u) {
            newId = WebsuiteSiteController.createSite('Slug Lookup Site', sampleConfig('Live'));
            WebsuiteReviewController.approveSite(newId, 'example.com', 'ok');
        }

        Test.startTest();
        WebsuitePublicSiteController.PublicSiteView bySlug = WebsuitePublicSiteController.getPublishedSite(
            'slug-lookup-site'
        );
        Test.stopTest();

        System.assertEquals(true, bySlug.isPublished, 'Slug resolves to the published site');
        System.assertEquals(newId, bySlug.siteId, 'Slug lookup returns the same record Id as an Id lookup would');
        System.assertEquals('slug-lookup-site', bySlug.siteSlug, 'Canonical slug echoed back');
    }

    // A slug that matches no site must fail exactly like an unknown Id does —
    // not published, no config, no exception. Guards against a lookup that
    // accidentally falls through to something broader than an exact match.
    @isTest
    static void getPublishedSiteNeverThrowsForUnknownSlug() {
        Test.startTest();
        WebsuitePublicSiteController.PublicSiteView view = WebsuitePublicSiteController.getPublishedSite(
            'no-such-site-exists'
        );
        Test.stopTest();

        System.assertEquals(false, view.isPublished, 'Unknown slug returns isPublished false, not an exception');
        System.assertEquals(null, view.siteId, 'No Id leaked for an unresolved reference');
    }

    @isTest
    static void getPublishedSiteIsPublishedFalseWhenNeverPublished() {
        User u = buildUser();
        Id newId;
        System.runAs(u) {
            newId = WebsuiteSiteController.createSite('Draft only', sampleConfig('Draft'));
        }

        Test.startTest();
        WebsuitePublicSiteController.PublicSiteView view = WebsuitePublicSiteController.getPublishedSite(newId);
        Test.stopTest();

        System.assertEquals(false, view.isPublished, 'Never-published site reports isPublished false');
        System.assertEquals(null, view.config, 'No config is exposed for an unpublished site');
    }

    @isTest
    static void getPublishedSiteNeverThrowsForMissingOrNullId() {
        User u = buildUser();
        Id deletedId;
        System.runAs(u) {
            deletedId = WebsuiteSiteController.createSite('Soon deleted', sampleConfig('X'));
            delete [SELECT Id FROM Website_Site__c WHERE Id = :deletedId];
        }

        Test.startTest();
        WebsuitePublicSiteController.PublicSiteView missing = WebsuitePublicSiteController.getPublishedSite(deletedId);
        WebsuitePublicSiteController.PublicSiteView blank = WebsuitePublicSiteController.getPublishedSite(null);
        Test.stopTest();

        System.assertEquals(false, missing.isPublished, 'Unknown id returns isPublished false, not an exception');
        System.assertEquals(false, blank.isPublished, 'Null id returns isPublished false, not an exception');
    }

    // Regression test for a real bug found live against pnpv2 during G1b, not
    // a theoretical one: every prior test here creates and reads the site as
    // the SAME user, which passes whether the class is `with sharing` or
    // `without sharing` — Website_Site__c is Private OWD, so it never actually
    // exercised cross-owner visibility. A real anonymous Guest User querying a
    // site it doesn't own (true for every real published site — none are
    // Guest-owned) got back an empty result under `with sharing`, silently
    // indistinguishable from "doesn't exist". This test uses two distinct
    // users specifically so it would have caught that.
    @isTest
    static void getPublishedSiteVisibleAcrossOwnersDespitePrivateSharing() {
        User owner = buildUser();
        User viewer = buildUser();
        Id newId;
        System.runAs(owner) {
            newId = WebsuiteSiteController.createSite('Cross Owner Site', sampleConfig('Live'));
            WebsuiteReviewController.approveSite(newId, 'example.com', 'ok');
        }

        Test.startTest();
        WebsuitePublicSiteController.PublicSiteView view;
        System.runAs(viewer) {
            view = WebsuitePublicSiteController.getPublishedSite(newId);
        }
        Test.stopTest();

        System.assertEquals(
            true,
            view.isPublished,
            'A published site must be visible to a user who does not own it — that is the entire point of publishing'
        );
        System.assert(view.config.contains('"heading":"Live"'), 'Config returned across the ownership boundary too');
    }

    @isTest
    static void getPublishedSiteHidesDraftAfterUnpublishedEdits() {
        User u = buildUser();
        Id newId;
        System.runAs(u) {
            newId = WebsuiteSiteController.createSite('Stale publish', sampleConfig('Published version'));
            WebsuiteReviewController.approveSite(newId, 'example.com', 'ok');
            WebsuiteSiteController.saveSite(newId, 'Stale publish', sampleConfig('Unpublished draft edit'));
        }

        Test.startTest();
        WebsuitePublicSiteController.PublicSiteView view = WebsuitePublicSiteController.getPublishedSite(newId);
        Test.stopTest();

        System.assert(view.config.contains('"heading":"Published version"'), 'Guests still see the last published copy');
        System.assert(!view.config.contains('Unpublished draft edit'), 'In-progress draft edits never leak to guests');
    }
}
