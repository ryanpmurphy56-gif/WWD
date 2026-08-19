/**
 * The ONLY Apex entry point the public renderer calls. Kept as its own class
 * (separate from WebsuiteSiteController) so the Guest User Profile's Apex class
 * access grant can be scoped to just this one read path — never
 * createSite/saveSite/publishSite/restoreVersion, and never Config__c (the
 * draft), only Published_Config__c.
 *
 * Never throws on a missing/unpublished site — always returns isPublished as
 * false instead, so a guest can't distinguish "doesn't exist" from "not
 * published yet" from an actual error.
 *
 * G1b: `siteRef` accepts EITHER a record Id or a site slug. Which one it is can
 * be decided without ambiguity because WebsuiteSlug.isAvailableShape() refuses
 * to issue an Id-shaped slug — see docs/url-contract.md §3. That is what lets
 * every Id-form address already shared keep resolving forever, while new links
 * read as ?site=rubys-diner.
 *
 * `without sharing`, deliberately — found and fixed live during G1b, not
 * theoretical. Website_Site__c is Private OWD, and every real site is owned by
 * whichever staff/account identity created it, never by the Guest User itself
 * (confirmed against pnpv2: zero published sites are Guest-owned). A `with
 * sharing` class on the Guest User's session means record-level sharing
 * silently returns zero rows for a site it doesn't own — not an error, just an
 * empty result indistinguishable from "doesn't exist" — so no real anonymous
 * visitor has ever been able to load ANY published site through this path,
 * including before G1b, back to whenever F7b first shipped it. Owner-based
 * sharing was never the right model here anyway: a *published* site is public
 * by definition, to everyone, regardless of who owns the underlying CRM
 * record — that's the whole point of publishing one. The method's own logic
 * is the real boundary: Published_Config__c only, only when Is_Published__c,
 * nothing else on the object ever touched. Same tradeoff shape as
 * WebsiteSiteController's `update as system` (see
 * websuite-guest-user-license-constraint memory) — bypassing a platform
 * mechanism that doesn't fit this identity, in favour of one the code enforces
 * itself, flagged here rather than left to be found by accident again.
 */
public without sharing class WebsuitePublicSiteController {
    @AuraEnabled(cacheable=true)
    public static PublicSiteView getPublishedSite(String siteRef) {
        PublicSiteView view = new PublicSiteView();
        view.isPublished = false;
        view.config = null;
        view.publishedAt = null;
        view.siteId = null;
        view.siteSlug = null;
        if (String.isBlank(siteRef)) {
            return view;
        }

        List<Website_Site__c> sites = lookup(siteRef);
        if (sites.isEmpty() || !sites[0].Is_Published__c || String.isBlank(sites[0].Published_Config__c)) {
            return view;
        }
        view.isPublished = true;
        view.config = sites[0].Published_Config__c;
        view.publishedAt = sites[0].Published_At__c;
        // The canonical reference for this site: its slug when it has one, its
        // Id when it doesn't. A site whose slug candidates were all taken is
        // deliberately created with no slug at all (G1a) rather than not
        // created, so the Id form has to stay a first-class address, not a
        // legacy one.
        view.siteId = sites[0].Id;
        view.siteSlug = sites[0].Slug__c;
        return view;
    }

    /**
     * Id first, slug second. `Id.valueOf` is the authority on what is Id-shaped
     * — not WebsuiteSlug.looksLikeId(), which tests a *normalised* (lowercased)
     * slug and would reject the mixed case a real Id carries.
     *
     * A ref that parses as an Id is never also tried as a slug: the shape guard
     * means no slug can collide with one, so a miss here is a genuine miss.
     *
     * `WITH SYSTEM_MODE`, not USER_MODE — found live, not theoretical, while
     * verifying G1b actually works for a real anonymous visitor: `WITH
     * USER_MODE` enforces sharing rules "as well as" CRUD/FLS regardless of the
     * class's own `with`/`without sharing` declaration (that's what the
     * modifier means), so the class-level `without sharing` above was a no-op
     * against this query specifically — a real Guest User session traced
     * against pnpv2 came back with zero rows for a site it doesn't own even
     * after that fix, confirmed via ApexLog (SOQL_EXECUTE_END|Rows:0). This
     * predates G1b: the Id-only lookup had the same `WITH USER_MODE` before
     * this milestone, so no real anonymous visitor has ever loaded a published
     * site this way. Safe to drop to SYSTEM_MODE specifically because the
     * method's own logic is already the real access boundary, documented on
     * the class: only Published_Config__c, only when Is_Published__c, nothing
     * else on the record ever returned.
     */
    private static List<Website_Site__c> lookup(String siteRef) {
        Id siteId = parseId(siteRef);
        if (siteId != null) {
            return [
                SELECT Id, Slug__c, Published_Config__c, Is_Published__c, Published_At__c
                FROM Website_Site__c
                WHERE Id = :siteId
                WITH SYSTEM_MODE
                LIMIT 1
            ];
        }
        // Slug__c is unique on a real platform index, so LIMIT 1 is exact
        // rather than arbitrary. Matched verbatim, not normalised: a stored
        // slug is already normalised, so normalising the inbound ref here would
        // silently make ?site=Rubys%20Diner resolve and let a second,
        // non-canonical address for the same site into circulation.
        String slug = siteRef;
        return [
            SELECT Id, Slug__c, Published_Config__c, Is_Published__c, Published_At__c
            FROM Website_Site__c
            WHERE Slug__c = :slug
            WITH SYSTEM_MODE
            LIMIT 1
        ];
    }

    private static Id parseId(String raw) {
        try {
            return Id.valueOf(raw);
        } catch (Exception e) {
            return null;
        }
    }

    /** Guests never see whether config is null vs. blank vs. missing — just a flat published/not-published shape. */
    public class PublicSiteView {
        @AuraEnabled
        public Boolean isPublished;
        @AuraEnabled
        public String config;
        @AuraEnabled
        public Datetime publishedAt;
        /**
         * Both null unless the site resolved AND is published — a guest asking
         * about an unpublished site learns nothing about it, including whether
         * the address they tried is the canonical one.
         */
        @AuraEnabled
        public Id siteId;
        @AuraEnabled
        public String siteSlug;
    }
}
