/**
 * Persistence for the Websuite editor. One Website_Site__c record holds one
 * site as a SiteConfig JSON document in Config__c — the single source of truth
 * the editor reads from and writes to.
 *
 * createSite()           — inserts a new site from a seed config, returns its Id.
 * createSiteForAccount() — same, plus attributes the site to a Websuite_Account__c.
 * saveSite()             — writes the working SiteConfig back to an existing record.
 * loadSite()             — reads one site's config for the editor to hydrate its store.
 * publishSite()          — copies the draft live and snapshots a version.
 * submitForReview()      — flags a draft for manual staff review; does NOT publish.
 * getSiteSlug()          — reads the site's public address name.
 * setSiteSlug()          — renames the site's public address; refuses a taken one.
 * getSites()             — lightweight list (no config body) for an editor entry screen.
 *
 * Two routes go live: publishSite() straight away, and submitForReview() into
 * the Command Center's "For Review" queue, from which WebsuiteReviewController.
 * approveSite() publishes. Both exist on purpose — the review gate is the
 * customer-facing path, direct publish is the staff/self path.
 *
 * The client owns SiteConfig's shape and versioning; Apex treats Config__c as
 * opaque JSON and never parses it. That keeps the AI/registry seams server-free.
 *
 * Slug__c is the one piece of addressing that can't live in that JSON: it has
 * to be unique across sites, which only the platform can enforce. The rules for
 * what a slug may be are in WebsuiteSlug; the addresses built from one are in
 * docs/url-contract.md.
 */
public with sharing class WebsuiteSiteController {
  @AuraEnabled
  public static Id createSite(String name, String configJson) {
    return createSiteInternal(name, configJson, null);
  }

  // Distinct name rather than an overload of createSite — two @AuraEnabled
  // methods sharing a name resolve ambiguously through the LWC
  // `@salesforce/apex/...` bridge (keyed by name only, not full signature),
  // unlike a plain Apex-to-Apex overload. accountId is optional and
  // unvalidated by design: it's whatever the browser's WebSuite account
  // session claims, so a site created while logged out simply gets no owner,
  // exactly as every site did before this field existed.
  @AuraEnabled
  public static Id createSiteForAccount(
    String name,
    String configJson,
    Id accountId
  ) {
    return createSiteInternal(name, configJson, accountId);
  }

  // Runs as system mode — see saveSite()'s doc comment for the Guest User
  // license background. accountId adds a second reason beyond that one:
  // Websuite_Account__c's external sharing model is Private, and a
  // guest-created Website_Site__c inserting a lookup to an account record it
  // doesn't own trips INSUFFICIENT_ACCESS_ON_CROSS_REFERENCE_ENTITY even with
  // object-level Create granted — row-level sharing on the *referenced*
  // record, not CRUD on Website_Site__c, is what's enforced there.
  private static Id createSiteInternal(
    String name,
    String configJson,
    Id accountId
  ) {
    if (String.isBlank(configJson)) {
      throw new AuraHandledException('A site configuration is required.');
    }
    Website_Site__c site = new Website_Site__c(
      Name = siteName(name),
      Config__c = configJson,
      Websuite_Account__c = accountId
    );
    insertWithSlug(site, WebsuiteSlug.toSlugOr(name, 'site'));
    return site.Id;
  }

  /**
   * How many addresses to try before giving up on a readable one. A collision
   * needs a second insert (the platform's unique index is the only authority on
   * whether a slug is free — a pre-flight SOQL check would still race, and
   * under sharing could be wrong outright), so this is a real DML budget, not a
   * loop counter.
   */
  private static final Integer SLUG_ATTEMPTS = 5;

  /**
   * Insert a site, walking base, base-2, base-3, … past any address already
   * taken, and falling back to no slug at all rather than failing.
   *
   * That last part is the important one: a site being created is a customer
   * mid-save, and losing their work because every candidate address was
   * congested would be absurd. A site with a blank slug is still fully
   * reachable — ?site= takes the record Id too, by design (docs/url-contract.md)
   * — it just isn't readable until someone renames it in the hub.
   */
  private static void insertWithSlug(Website_Site__c site, String base) {
    for (Integer attempt = 1; attempt <= SLUG_ATTEMPTS; attempt++) {
      site.Slug__c = WebsuiteSlug.candidate(base, attempt);
      try {
        insert as system site;
        return;
      } catch (DmlException e) {
        if (!isDuplicateValue(e)) {
          throw new AuraHandledException(e.getMessage());
        }
      }
    }
    site.Slug__c = null;
    try {
      insert as system site;
    } catch (DmlException e) {
      throw new AuraHandledException(e.getMessage());
    }
  }

  /**
   * One site's address name. Exists because createSite() returns only an Id —
   * changing that signature would touch every caller — so after a first save
   * the client knows the record but not the address the server generated for
   * it. Blank is a real answer (a site created before G1a, or one whose
   * candidate addresses were all taken), not an error.
   */
  @AuraEnabled
  public static String getSiteSlug(Id siteId) {
    if (siteId == null) {
      return '';
    }
    List<Website_Site__c> sites = [
      SELECT Slug__c
      FROM Website_Site__c
      WHERE Id = :siteId
      WITH USER_MODE
      LIMIT 1
    ];
    return sites.isEmpty() || sites[0].Slug__c == null ? '' : sites[0].Slug__c;
  }

  /**
   * Rename a site's public address. Returns the slug actually stored so the
   * client shows what it got rather than what it asked for — the normalisation
   * rule turns "Ruby's Diner!" into "rubys-diner" and the caller shouldn't have
   * to reimplement that to display it.
   *
   * Unlike generation, a collision here is an error rather than a silent
   * suffix: someone typed this address on purpose, and quietly handing them
   * "rubys-diner-4" is worse than telling them it's taken.
   */
  @AuraEnabled
  public static String setSiteSlug(Id siteId, String requested) {
    if (siteId == null) {
      throw new AuraHandledException('A site record is required.');
    }
    String slug = WebsuiteSlug.normalize(requested);
    if (String.isBlank(slug)) {
      throw new AuraHandledException(
        'An address needs at least one letter or number.'
      );
    }
    if (WebsuiteSlug.RESERVED.contains(slug)) {
      throw new AuraHandledException('"' + slug + '" is a reserved address.');
    }
    if (WebsuiteSlug.looksLikeId(slug)) {
      // See WebsuiteSlug.looksLikeId — an Id-shaped slug would make ?site=
      // ambiguous, which is what keeps every already-shared link working.
      throw new AuraHandledException(
        'That address looks like a record Id — add a hyphen to it.'
      );
    }
    try {
      // See saveSite()'s doc comment — same Guest User license constraint.
      update as system new Website_Site__c(Id = siteId, Slug__c = slug);
    } catch (DmlException e) {
      if (isDuplicateValue(e)) {
        throw new AuraHandledException(
          '"' + slug + '" is already taken — try another.'
        );
      }
      throw new AuraHandledException(e.getMessage());
    }
    return slug;
  }

  // A unique-index violation, as opposed to any other DML failure. Guarded on
  // getNumDml() because getDmlType(0) throws on an exception carrying no rows.
  private static Boolean isDuplicateValue(DmlException e) {
    return e.getNumDml() > 0 && e.getDmlType(0) == StatusCode.DUPLICATE_VALUE;
  }

  /**
   * Overwrites an existing site's config. The full working SiteConfig is sent
   * with every save, so a single update is enough — matching how the editor's
   * one-state-object model works. Name is kept in sync for list readability.
   *
   * Runs as AccessLevel.SYSTEM_MODE rather than gating on isUpdateable(): the
   * editor's own running identity is the Experience Cloud Site Guest User for
   * every anonymous visitor building a site (the app's email/code account
   * layer sits on top of that, it isn't a real Salesforce login), and the
   * Guest User license can never be granted native Edit on any object — Setup
   * itself refuses to deploy that permission. Access to this class (via the
   * guest-assigned Websuite_Public_Preview permission set) is the real trust
   * boundary here, same as the rest of this controller's design.
   *
   * Known tradeoff: this bypasses record-level protection, and nothing here
   * checks that the caller's session actually owns the siteId being written —
   * the same exposure loadSite()'s guest Read access already had. Worth a real
   * session-token ownership check if this ever needs to hold off a targeted
   * attacker rather than casual poking.
   */
  @AuraEnabled
  public static void saveSite(Id siteId, String name, String configJson) {
    if (siteId == null || String.isBlank(configJson)) {
      throw new AuraHandledException(
        'A site record and configuration are required.'
      );
    }
    Website_Site__c site = new Website_Site__c(
      Id = siteId,
      Name = siteName(name),
      Config__c = configJson
    );
    try {
      update as system site;
    } catch (DmlException e) {
      throw new AuraHandledException(e.getMessage());
    }
  }

  @AuraEnabled(cacheable=true)
  public static SiteView loadSite(Id siteId) {
    if (siteId == null) {
      throw new AuraHandledException('A site record is required.');
    }
    List<Website_Site__c> sites = [
      SELECT
        Id,
        Name,
        Slug__c,
        Config__c,
        Is_Published__c,
        Published_At__c,
        Review_Status__c,
        Submitted_At__c
      FROM Website_Site__c
      WHERE Id = :siteId
      WITH USER_MODE
      LIMIT 1
    ];
    if (sites.isEmpty()) {
      throw new AuraHandledException('That site could not be found.');
    }
    return toView(sites[0], true);
  }

  /**
   * Publish: copy the current draft (Config__c) into Published_Config__c and
   * snapshot it into a new Website_Site_Version__c row for history/restore.
   * Config__c itself is untouched — publishing never changes what's being
   * edited, only what getPublishedSite() serves.
   */
  @AuraEnabled
  public static PublishResult publishSite(Id siteId) {
    if (siteId == null) {
      throw new AuraHandledException('A site record is required.');
    }
    List<Website_Site__c> sites = [
      SELECT Id, Config__c
      FROM Website_Site__c
      WHERE Id = :siteId
      WITH USER_MODE
      LIMIT 1
    ];
    if (sites.isEmpty()) {
      throw new AuraHandledException('That site could not be found.');
    }
    if (String.isBlank(sites[0].Config__c)) {
      throw new AuraHandledException(
        'Nothing to publish yet — save the site first.'
      );
    }
    DateTime now = DateTime.now();
    try {
      // See saveSite()'s doc comment — same Guest User license constraint.
      update as system new Website_Site__c(
        Id = siteId,
        Published_Config__c = sites[0].Config__c,
        Is_Published__c = true,
        Published_At__c = now
      );
      insert as system new Website_Site_Version__c(
        Website_Site__c = siteId,
        Snapshot_Config__c = sites[0].Config__c,
        Published_At__c = now
      );
    } catch (DmlException e) {
      throw new AuraHandledException(e.getMessage());
    }
    PublishResult result = new PublishResult();
    result.publishedAt = now;
    return result;
  }

  /**
   * Submit the current draft for manual staff review — this does NOT publish.
   * A reviewer checks the draft in the Command Center's "For Review" tab and
   * either approves it live (WebsuiteReviewController.approveSite) or sends it
   * back (rejectSite). Config__c is untouched, same as publishSite() treats it.
   */
  @AuraEnabled
  public static SubmitResult submitForReview(Id siteId) {
    if (siteId == null) {
      throw new AuraHandledException('A site record is required.');
    }
    List<Website_Site__c> sites = [
      SELECT Id, Config__c
      FROM Website_Site__c
      WHERE Id = :siteId
      WITH USER_MODE
      LIMIT 1
    ];
    if (sites.isEmpty()) {
      throw new AuraHandledException('That site could not be found.');
    }
    if (String.isBlank(sites[0].Config__c)) {
      throw new AuraHandledException(
        'Nothing to submit yet — save the site first.'
      );
    }
    DateTime now = DateTime.now();
    try {
      // See saveSite()'s doc comment — same Guest User license constraint.
      update as system new Website_Site__c(
        Id = siteId,
        Review_Status__c = 'Pending Review',
        Submitted_At__c = now
      );
    } catch (DmlException e) {
      throw new AuraHandledException(e.getMessage());
    }
    SubmitResult result = new SubmitResult();
    result.submittedAt = now;
    return result;
  }

  /** Lightweight publish history for a site, newest first — snapshot bodies
   *  are omitted so the list loads cheaply even with many versions. */
  @AuraEnabled(cacheable=true)
  public static List<VersionView> getVersionHistory(Id siteId) {
    if (siteId == null) {
      throw new AuraHandledException('A site record is required.');
    }
    List<VersionView> views = new List<VersionView>();
    for (Website_Site_Version__c v : [
      SELECT Id, Published_At__c
      FROM Website_Site_Version__c
      WHERE Website_Site__c = :siteId
      WITH USER_MODE
      ORDER BY Published_At__c DESC
      LIMIT 50
    ]) {
      VersionView vv = new VersionView();
      vv.id = v.Id;
      vv.publishedAt = v.Published_At__c;
      views.add(vv);
    }
    return views;
  }

  /**
   * Restore a past published snapshot back into the DRAFT (Config__c) so it
   * can be reviewed/edited before being published again. Deliberately does
   * NOT touch Published_Config__c — restoring is a draft-side undo, not an
   * instant re-publish. Returns the restored JSON so the client can hydrate
   * its store without a second round trip.
   */
  @AuraEnabled
  public static String restoreVersion(Id siteId, Id versionId) {
    if (siteId == null || versionId == null) {
      throw new AuraHandledException('A site and a version are required.');
    }
    List<Website_Site_Version__c> versions = [
      SELECT Snapshot_Config__c, Website_Site__c
      FROM Website_Site_Version__c
      WHERE Id = :versionId
      WITH USER_MODE
      LIMIT 1
    ];
    if (versions.isEmpty() || versions[0].Website_Site__c != siteId) {
      throw new AuraHandledException(
        'That version could not be found for this site.'
      );
    }
    String snapshot = versions[0].Snapshot_Config__c;
    try {
      // See saveSite()'s doc comment — same Guest User license constraint.
      update as system new Website_Site__c(Id = siteId, Config__c = snapshot);
    } catch (DmlException e) {
      throw new AuraHandledException(e.getMessage());
    }
    return snapshot;
  }

  /**
   * The last-published snapshot for a site, for a public/live renderer.
   * Refuses to serve anything for a site that has never been published —
   * Published_Config__c is blank until the first publishSite() call, and
   * Is_Published__c is the explicit guard so a draft is never exposed here.
   */
  @AuraEnabled(cacheable=true)
  public static SiteView getPublishedSite(Id siteId) {
    if (siteId == null) {
      throw new AuraHandledException('A site record is required.');
    }
    List<Website_Site__c> sites = [
      SELECT Id, Name, Published_Config__c, Is_Published__c, Published_At__c
      FROM Website_Site__c
      WHERE Id = :siteId
      WITH USER_MODE
      LIMIT 1
    ];
    if (
      sites.isEmpty() ||
      !sites[0].Is_Published__c ||
      String.isBlank(sites[0].Published_Config__c)
    ) {
      throw new AuraHandledException('This site has not been published yet.');
    }
    SiteView v = new SiteView();
    v.id = sites[0].Id;
    v.name = sites[0].Name;
    v.config = sites[0].Published_Config__c;
    v.isPublished = true;
    v.publishedAt = sites[0].Published_At__c;
    return v;
  }

  /**
   * The origin a published site is actually served from — the Salesforce Site
   * hosting WebsitePublicSite.page. Callers append
   * '/WebsitePublicSite?site=<id>' to build a shareable address.
   *
   * Returns blank rather than throwing when the running user isn't in a Site
   * context (staff opening the editor from Lightning Experience get the
   * *.lightning.force.com origin, which would not serve the public page). An
   * org can host several Sites and nothing here can tell which one is meant,
   * so a guessed origin behind a "copy link" button — a link the owner would
   * then hand to customers — is worse than admitting we don't know it.
   */
  @AuraEnabled(cacheable=true)
  public static String getPublicSiteOrigin() {
    String base = Site.getBaseUrl();
    return String.isBlank(base) ? '' : base;
  }

  /**
   * Sites the running user can see, newest-edited first, without the (large)
   * config body — enough to render an "open a site" list cheaply.
   */
  @AuraEnabled(cacheable=true)
  public static List<SiteView> getSites() {
    List<SiteView> views = new List<SiteView>();
    for (Website_Site__c s : [
      SELECT
        Id,
        Name,
        Slug__c,
        Is_Published__c,
        Published_At__c,
        Review_Status__c,
        Submitted_At__c
      FROM Website_Site__c
      WITH USER_MODE
      ORDER BY LastModifiedDate DESC
    ]) {
      views.add(toView(s, false));
    }
    return views;
  }

  // Config__c is NOT null, so a blank name would fail the layout's Name
  // requirement silently on some editions — fall back to a sensible default.
  private static String siteName(String name) {
    return String.isBlank(name) ? 'Untitled site' : name.trim().left(80);
  }

  // Inner Apex classes can't declare static members, so the factory lives on
  // the outer class.
  private static SiteView toView(Website_Site__c s, Boolean withConfig) {
    SiteView v = new SiteView();
    v.id = s.Id;
    v.name = s.Name;
    v.slug = s.Slug__c;
    v.config = withConfig ? s.Config__c : null;
    v.isPublished = s.Is_Published__c;
    v.publishedAt = s.Published_At__c;
    v.reviewStatus = s.Review_Status__c;
    v.submittedAt = s.Submitted_At__c;
    return v;
  }

  /** Flattened site row for the editor; config is omitted from list views. */
  public class SiteView {
    @AuraEnabled
    public Id id;
    @AuraEnabled
    public String name;
    /** Blank for sites created before G1a — ?site= still takes the Id. */
    @AuraEnabled
    public String slug;
    @AuraEnabled
    public String config;
    @AuraEnabled
    public Boolean isPublished;
    @AuraEnabled
    public DateTime publishedAt;
    @AuraEnabled
    public String reviewStatus;
    @AuraEnabled
    public DateTime submittedAt;
  }

  public class PublishResult {
    @AuraEnabled
    public DateTime publishedAt;
  }

  public class SubmitResult {
    @AuraEnabled
    public DateTime submittedAt;
  }

  /** One row in a site's publish history. */
  public class VersionView {
    @AuraEnabled
    public Id id;
    @AuraEnabled
    public DateTime publishedAt;
  }
}