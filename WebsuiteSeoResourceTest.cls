@isTest
private class WebsuiteSeoResourceTest {
    private static User buildUser() {
        Profile p = [SELECT Id FROM Profile WHERE Name = 'Standard User' LIMIT 1];
        User u = new User(
            Alias = 'wseo',
            Email = 'websuite.seo.tester@example.com',
            EmailEncodingKey = 'UTF-8',
            LastName = 'Tester',
            LanguageLocaleKey = 'en_US',
            LocaleSidKey = 'en_US',
            ProfileId = p.Id,
            TimeZoneSidKey = 'Australia/Melbourne',
            Username = 'websuite.seo.tester.' + System.now().getTime() + '@example.com.wstest'
        );
        insert u;
        PermissionSet ps = [SELECT Id FROM PermissionSet WHERE Name = 'Websuite_Command_Center' LIMIT 1];
        insert new PermissionSetAssignment(AssigneeId = u.Id, PermissionSetId = ps.Id);
        return u;
    }

    private static String twoPageConfig() {
        return '{"siteId":"abc","meta":{"businessName":"Ruby\'s"},"pages":['
            + '{"pageId":"p1","slug":"home","isHome":true,"sections":[]},'
            + '{"pageId":"p2","slug":"about","sections":[]}'
            + ']}';
    }

    // No page is flagged isHome — exercises resolveHome()'s fallback-to-first
    // rather than its explicit-flag branch.
    private static String twoPageConfigNoExplicitHome() {
        return '{"siteId":"abc","meta":{"businessName":"Ruby\'s"},"pages":['
            + '{"pageId":"p1","slug":"landing","sections":[]},'
            + '{"pageId":"p2","slug":"about","sections":[]}'
            + ']}';
    }

    private static String callGet(String path, String siteRef) {
        RestRequest req = new RestRequest();
        req.requestURI = '/services/apexrest/websuite/seo/' + path;
        req.httpMethod = 'GET';
        if (siteRef != null) {
            req.params.put('site', siteRef);
        }
        RestContext.request = req;
        RestContext.response = new RestResponse();

        WebsuiteSeoResource.doGet();

        return RestContext.response.responseBody.toString();
    }

    @isTest
    static void sitemapXmlListsPublishedPageSlugsUnderCanonicalSlug() {
        User u = buildUser();
        Id newId;
        System.runAs(u) {
            newId = WebsuiteSiteController.createSite('Sitemap Site', twoPageConfig());
            WebsuiteReviewController.approveSite(newId, 'example.com', 'ok');
        }

        Test.startTest();
        // Looked up by Id, same as any pre-slug bookmark would — the sitemap
        // itself must still come back keyed by the canonical slug either way.
        String body = callGet('sitemap.xml', String.valueOf(newId));
        Test.stopTest();

        System.assert(body.contains('<urlset'), 'Response is a urlset document');
        System.assert(body.contains('site=sitemap-site'), '<loc> entries use the slug, not the Id');
        System.assert(!body.contains('site=' + newId), 'Id form does not leak into the sitemap it was looked up with');
        // Home carries no &page= (docs/url-contract.md §2) — a bare ?site=
        // entry stands in for it; "about" keeps its explicit page param.
        System.assert(body.contains('<loc>') && body.contains('site=sitemap-site</loc>'), 'Home page listed with no &page=');
        System.assert(body.contains('site=sitemap-site&amp;page=about'), 'Non-home page keeps its &page=');
        System.assert(!body.contains('page=home'), 'Home slug itself never appears as a &page= value');
        System.assert(body.contains('<lastmod>'), 'Publish timestamp included as lastmod');
    }

    @isTest
    static void sitemapXmlFallsBackToFirstPageWhenNoneFlaggedHome() {
        User u = buildUser();
        Id newId;
        System.runAs(u) {
            newId = WebsuiteSiteController.createSite('Fallback Home Site', twoPageConfigNoExplicitHome());
            WebsuiteReviewController.approveSite(newId, 'example.com', 'ok');
        }

        Test.startTest();
        String body = callGet('sitemap.xml', String.valueOf(newId));
        Test.stopTest();

        System.assert(body.contains('site=fallback-home-site</loc>'), 'First page (landing) stands in as home with no &page=');
        System.assert(body.contains('site=fallback-home-site&amp;page=about'), 'Second page keeps its explicit &page=');
        System.assert(!body.contains('page=landing'), 'The fallback-home page never also appears with a &page= of its own');
    }

    @isTest
    static void getPublishedSiteResolvesBySlugForSitemapToo() {
        User u = buildUser();
        Id newId;
        System.runAs(u) {
            newId = WebsuiteSiteController.createSite('Slug Fetched Site', twoPageConfig());
            WebsuiteReviewController.approveSite(newId, 'example.com', 'ok');
        }

        Test.startTest();
        // Same endpoint, addressed the new way — proves the REST resource
        // shares WebsuitePublicSiteController's lookup rather than assuming Id.
        String body = callGet('sitemap.xml', 'slug-fetched-site');
        Test.stopTest();

        System.assert(body.contains('site=slug-fetched-site'), 'Sitemap resolves and re-emits the same slug it was called with');
    }

    @isTest
    static void sitemapXmlEmptyWhenUnpublished() {
        User u = buildUser();
        Id newId;
        System.runAs(u) {
            newId = WebsuiteSiteController.createSite('Draft only', twoPageConfig());
        }

        Test.startTest();
        String body = callGet('sitemap.xml', String.valueOf(newId));
        Test.stopTest();

        System.assert(body.contains('<urlset'), 'Still a valid (empty) urlset document');
        System.assert(!body.contains('<url>'), 'No page entries for an unpublished site');
    }

    @isTest
    static void sitemapXmlHandlesMissingSiteParam() {
        Test.startTest();
        String body = callGet('sitemap.xml', null);
        Test.stopTest();

        System.assert(body.contains('<urlset'), 'Missing site param still returns a valid empty urlset, not an error');
        System.assert(!body.contains('<url>'), 'No entries with no site specified');
    }

    // A site parameter that doesn't resolve to anything published must not be
    // echoed anywhere in the response — canonicalRef() only ever emits a value
    // that came off a resolved, published record, never the raw request
    // parameter. Otherwise this endpoint would happily reflect arbitrary text
    // (a newline could inject a line into robots.txt) back at the caller.
    @isTest
    static void sitemapAndRobotsNeverEchoAnUnresolvedSiteParam() {
        Test.startTest();
        String sitemapBody = callGet('sitemap.xml', 'no-such-site%0ADisallow:%20/');
        String robotsBody = callGet('robots.txt', 'no-such-site%0ADisallow:%20/');
        Test.stopTest();

        System.assert(!sitemapBody.contains('no-such-site'), 'Unresolved sitemap request never echoes its input');
        System.assert(!robotsBody.contains('no-such-site'), 'Unresolved robots.txt request never echoes its input');
        System.assert(robotsBody.contains('sitemap.xml\n'), 'No dangling ?site= on the sitemap link when nothing resolved');
    }

    @isTest
    static void robotsTxtReferencesSitemapUnderCanonicalSlug() {
        User u = buildUser();
        Id newId;
        System.runAs(u) {
            newId = WebsuiteSiteController.createSite('Robots Site', twoPageConfig());
            WebsuiteReviewController.approveSite(newId, 'example.com', 'ok');
        }

        Test.startTest();
        String body = callGet('robots.txt', String.valueOf(newId));
        Test.stopTest();

        System.assert(body.contains('User-agent: *'), 'Allows all crawlers');
        System.assert(body.contains('Sitemap: '), 'References a sitemap');
        System.assert(body.contains('sitemap.xml?site=robots-site'), 'Sitemap URL is scoped by the canonical slug, not the Id it was looked up with');
        System.assert(!body.contains(String.valueOf(newId)), 'Raw Id does not leak into the sitemap link once a slug exists');
    }

    // Mirrors the published-site case above for a site that has never been
    // published — canonicalRef() returns '' since view.isPublished is false,
    // so the sitemap link degrades to unscoped rather than pointing at a site
    // whose sitemap would be empty anyway.
    @isTest
    static void robotsTxtOmitsSiteParamForUnpublishedSite() {
        User u = buildUser();
        Id newId;
        System.runAs(u) {
            newId = WebsuiteSiteController.createSite('Unpublished Robots Site', twoPageConfig());
        }

        Test.startTest();
        String body = callGet('robots.txt', String.valueOf(newId));
        Test.stopTest();

        System.assert(body.contains('sitemap.xml\n'), 'No ?site= scoping for a site that was never published');
    }
}
