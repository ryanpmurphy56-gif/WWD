/**
 * First @RestResource in this app — serves sitemap.xml and robots.txt for a
 * published WebSuite site, reachable at
 * /services/apexrest/websuite/seo/sitemap.xml?site=<Id> and .../robots.txt.
 * Plain HTTP text/XML with no JS dependency — unlike sitePublicRenderer's
 * client-side <head> injection, these ARE reliably crawler-visible regardless
 * of whether the crawler executes JavaScript.
 *
 * Delegates to WebsuitePublicSiteController.getPublishedSite() so "never
 * expose an unpublished site" stays enforced in exactly one place.
 */
@RestResource(urlMapping='/websuite/seo/*')
global with sharing class WebsuiteSeoResource {
  /**
   * Path of the page that serves a published site, appended to baseUrl() to
   * build each <loc>. This was '/preview' — a route with no metadata anywhere
   * in this project — while the page that actually deploys is the Visualforce
   * WebsitePublicSite (see pages/WebsitePublicSite.page and the
   * aura/websuitePublicApp bundle). A sitemap is read by crawlers, so pointing
   * it at a route that 404s is worse than pointing it nowhere.
   *
   * That the classic Site is the host is now a recorded decision rather than
   * an accident of what deployed — see docs/url-contract.md, which is also
   * where the canonical form of these <loc> values is written down. G1b makes
   * both documents emit that canonical shape: the slug rather than the Id, and
   * the home page with no &page= at all.
   */
  private static final String PUBLIC_PAGE_PATH = '/WebsitePublicSite';

  @HttpGet
  global static void doGet() {
    RestRequest req = RestContext.request;
    RestResponse res = RestContext.response;
    // Resolved once and shared: robots.txt needs the canonical reference just
    // as much as the sitemap does, and neither may echo the raw parameter.
    WebsuitePublicSiteController.PublicSiteView view = WebsuitePublicSiteController.getPublishedSite(
      req.params.get('site')
    );

    if (req.requestURI.endsWith('/robots.txt')) {
      res.addHeader('Content-Type', 'text/plain; charset=UTF-8');
      res.responseBody = Blob.valueOf(robotsTxt(view));
    } else {
      res.addHeader('Content-Type', 'application/xml; charset=UTF-8');
      res.responseBody = Blob.valueOf(sitemapXml(view));
    }
  }

  /**
   * The canonical ?site= value for a resolved site: its slug when it has one,
   * its Id when it doesn't (G1a creates a site with no slug rather than fail
   * over a congested address, and both forms resolve).
   *
   * Blank for anything that didn't resolve — which is the point. Before G1b the
   * only accepted input was an Id, so echoing the parameter back was safe;
   * ?site= now accepts free text, and a raw echo would let a newline inside it
   * inject a line into robots.txt ("...&site=x%0ADisallow:%20/"). Every value
   * emitted below therefore comes off the record, never off the request. Stored
   * slugs are normalised to [a-z0-9-] by WebsuiteSlug, so they carry nothing to
   * escape.
   */
  private static String canonicalRef(
    WebsuitePublicSiteController.PublicSiteView view
  ) {
    if (view == null || !view.isPublished || view.siteId == null) {
      return '';
    }
    return String.isNotBlank(view.siteSlug)
      ? view.siteSlug
      : String.valueOf(view.siteId);
  }

  private static String baseUrl() {
    String base = Site.getBaseUrl();
    return String.isBlank(base) ? Url.getOrgDomainUrl().toExternalForm() : base;
  }

  private static String robotsTxt(
    WebsuitePublicSiteController.PublicSiteView view
  ) {
    String sitemapUrl =
      baseUrl() + '/services/apexrest/websuite/seo/sitemap.xml';
    String ref = canonicalRef(view);
    if (String.isNotBlank(ref)) {
      sitemapUrl += '?site=' + EncodingUtil.urlEncode(ref, 'UTF-8');
    }
    return 'User-agent: *\nAllow: /\n\nSitemap: ' + sitemapUrl + '\n';
  }

  private static String sitemapXml(
    WebsuitePublicSiteController.PublicSiteView view
  ) {
    List<String> entries = new List<String>();
    String ref = canonicalRef(view);
    if (view.isPublished && String.isNotBlank(view.config) && String.isNotBlank(ref)) {
      String lastmod = view.publishedAt != null
        ? view.publishedAt.formatGmt('yyyy-MM-dd')
        : null;
      String siteParam =
        baseUrl() +
        PUBLIC_PAGE_PATH +
        '?site=' +
        EncodingUtil.urlEncode(ref, 'UTF-8');
      for (PageEntry page : livePages(view.config)) {
        // The home page carries no &page= — ?site=x and ?site=x&page=home
        // render identically, so listing the second puts the home page into the
        // index competing with itself. docs/url-contract.md §2.
        String loc = page.isHome
          ? siteParam
          : siteParam + '&page=' + EncodingUtil.urlEncode(page.slug, 'UTF-8');
        String entry = '  <url>\n    <loc>' + escapeXml(loc) + '</loc>';
        if (lastmod != null) {
          entry += '\n    <lastmod>' + lastmod + '</lastmod>';
        }
        entry += '\n  </url>';
        entries.add(entry);
      }
    }
    String body = entries.isEmpty() ? '' : String.join(entries, '\n') + '\n';
    return '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      body +
      '</urlset>\n';
  }

  /** One live page, and whether it is the one served by a bare ?site=. */
  private class PageEntry {
    String slug;
    Boolean isHome = false;
  }

  // Config__c/Published_Config__c are normally treated as opaque JSON by
  // Apex (see WebsuiteSiteController's class doc) — this is the one
  // deliberate exception, since a sitemap needs each page's slug.
  private static List<PageEntry> livePages(String configJson) {
    List<PageEntry> live = new List<PageEntry>();
    try {
      Map<String, Object> config = (Map<String, Object>) JSON.deserializeUntyped(
        configJson
      );
      List<Object> pages = (List<Object>) config.get('pages');
      if (pages == null) {
        return live;
      }
      // One `now` for the whole document, so two pages scheduled either side of
      // the same instant can't disagree — same reason c/pageVisibility injects
      // it rather than reading the clock per page.
      Datetime now = System.now();
      for (Object pageObj : pages) {
        Map<String, Object> page = (Map<String, Object>) pageObj;
        Object slug = page.get('slug');
        if (
          slug instanceof String &&
          String.isNotBlank((String) slug) &&
          isPageLive(page, now)
        ) {
          PageEntry entry = new PageEntry();
          entry.slug = (String) slug;
          entry.isHome = page.get('isHome') == true;
          live.add(entry);
        }
      }
    } catch (Exception e) {
      // Malformed config shouldn't break the sitemap endpoint — serve
      // whatever was parsed before the failure (none, here).
    }
    return resolveHome(live);
  }

  /**
   * Exactly one live page is the home page, chosen the same way
   * sitePublicRenderer's `activePage` chooses it for a bare ?site=: the first
   * flagged isHome, else the first live page.
   *
   * Both halves matter, and both are duplicate-<loc> bugs rather than crashes.
   * With NO page flagged, the fallback page would otherwise be listed only as
   * ?site=x&page=its-slug while ?site=x — the address crawlers actually reach —
   * appeared nowhere. With TWO flagged, the second would emit a bare ?site=x of
   * its own, pointing at a page that URL never serves.
   */
  private static List<PageEntry> resolveHome(List<PageEntry> live) {
    if (live.isEmpty()) {
      return live;
    }
    Integer homeIndex = -1;
    for (Integer i = 0; i < live.size(); i++) {
      if (live[i].isHome) {
        homeIndex = i;
        break;
      }
    }
    if (homeIndex == -1) {
      homeIndex = 0;
    }
    for (Integer i = 0; i < live.size(); i++) {
      live[i].isHome = (i == homeIndex);
    }
    return live;
  }

  /**
   * The Apex half of c/pageVisibility, which owns this rule for the JS
   * consumers (nav builder, published renderer). Apex can't import an LWC
   * module, so the rule is necessarily restated here — the sitemap is named in
   * that module's doc as one of the three consumers that must not drift, and
   * before this it had no filtering at all, so every draft and scheduled page
   * was being handed to crawlers.
   *
   * Keep in step with c/pageVisibility.pageState().
   */
  private static Boolean isPageLive(Map<String, Object> page, Datetime now) {
    Object status = page.get('status');
    if (status instanceof String && (String) status == 'draft') {
      return false;
    }
    Object publishAt = page.get('publishAt');
    if (publishAt instanceof String) {
      // Not `when` — that's a reserved identifier in Apex (switch/when).
      Datetime goLiveAt = parseIsoDatetime((String) publishAt);
      if (goLiveAt != null && goLiveAt > now) {
        return false;
      }
    }
    return true;
  }

  /**
   * Null for anything unparseable, which callers treat as "no schedule" — the
   * same fail-open choice c/pageVisibility documents: failing closed would
   * silently drop a live page out of the sitemap over a typo.
   */
  private static Datetime parseIsoDatetime(String raw) {
    if (String.isBlank(raw) || raw.contains('"') || raw.contains('\\')) {
      return null;
    }
    try {
      return (Datetime) JSON.deserialize('"' + raw + '"', Datetime.class);
    } catch (Exception e) {
      // Not a full timestamp — fall through and try a plain date.
    }
    try {
      Date d = (Date) JSON.deserialize('"' + raw + '"', Date.class);
      return Datetime.newInstanceGmt(d, Time.newInstance(0, 0, 0, 0));
    } catch (Exception e) {
      return null;
    }
  }

  private static String escapeXml(String s) {
    return s.replace('&', '&amp;')
      .replace('<', '&lt;')
      .replace('>', '&gt;')
      .replace('"', '&quot;');
  }
}