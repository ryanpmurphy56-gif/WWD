/**
 * The Apex half of the URL contract — see docs/url-contract.md, which is the
 * document these rules implement and the place to change them.
 *
 * Slugs are what let a public address read as /WebsitePublicSite?site=rubys-diner
 * instead of ?site=a0B7X00000ABCDEUAW. This class owns the rule for turning
 * arbitrary text into one, and for deciding which normalised slugs are still
 * not allowed.
 *
 * c/urlContract restates all of this for the client. Apex can't import an LWC
 * module, so the duplication is unavoidable — the same situation
 * c/pageVisibility and WebsuiteSeoResource.isPageLive already live with. If a
 * rule changes here, it changes in three places: here, urlContract.js, and the
 * document.
 */
public with sharing class WebsuiteSlug {
  /** Platform-side cap; the Slug__c field is Text(60). */
  public static final Integer MAX_LENGTH = 60;

  /**
   * Names a slug may not take, because a slug becomes a path segment at G1c
   * when a custom domain fronts the Site and these would collide with (or be
   * shadowed by) a platform path. Cheap to enforce now, expensive to retrofit
   * once customers hold addresses that have to be taken off them.
   */
  public static final Set<String> RESERVED = new Set<String>{
    'admin',
    'api',
    'apex',
    'apexrest',
    'assets',
    'auth',
    'cms',
    'img',
    'lightning',
    'login',
    'logout',
    'preview',
    'resource',
    'robots',
    'robots-txt',
    'secur',
    'services',
    'servlet',
    'setup',
    'site',
    'sitemap',
    'sitemap-xml',
    'static',
    'websitepublicsite',
    'websuite',
    'www'
  };

  /**
   * Lowercase, non-alphanumeric runs collapsed to a single hyphen, trimmed and
   * truncated. Returns '' — never null — for anything that normalises away to
   * nothing; callers decide their own fallback, since 'page' is right for a
   * page and wrong for a site.
   *
   * Apostrophes are deleted rather than hyphenated, so "Ruby's Diner" becomes
   * rubys-diner and not ruby-s-diner. They're the one punctuation mark that
   * appears *inside* a word in a business name, which is exactly the kind of
   * name this has to produce a decent address for.
   */
  public static String normalize(String raw) {
    if (String.isBlank(raw)) {
      return '';
    }
    String s = raw.toLowerCase()
      .replaceAll('[\'‘’]', '')
      .replaceAll('[^a-z0-9]+', '-');
    s = s.replaceAll('^-+|-+$', '');
    if (s.length() > MAX_LENGTH) {
      // Truncating can leave a trailing hyphen mid-word — strip it again
      // rather than persisting 'my-long-business-'.
      s = s.left(MAX_LENGTH).replaceAll('-+$', '');
    }
    return s;
  }

  /**
   * True when a normalised slug is exactly the shape of a Salesforce record Id
   * — 15 or 18 characters, all alphanumeric, no hyphen.
   *
   * This is the guard that makes ?site= able to accept either an Id or a slug
   * without ambiguity, which is in turn what lets every Id-form URL already
   * shared keep resolving forever (G1b). Without it, a customer could claim a
   * slug that shadows some other site's Id.
   */
  public static Boolean looksLikeId(String slug) {
    if (String.isBlank(slug)) {
      return false;
    }
    Integer len = slug.length();
    return (len == 15 || len == 18) && Pattern.matches('[a-z0-9]+', slug);
  }

  /** Reserved, Id-shaped, or empty — the three ways a slug can be unusable. */
  public static Boolean isAvailableShape(String slug) {
    return String.isNotBlank(slug) &&
      !RESERVED.contains(slug) &&
      !looksLikeId(slug);
  }

  /**
   * Normalise `raw` into a usable slug, falling back to `fallback` when it
   * normalises to nothing or to a name that isn't allowed. Suffixing the
   * fallback rather than throwing is deliberate: this is the generation path,
   * where nobody is watching and a site still needs an address.
   */
  public static String toSlugOr(String raw, String fallback) {
    String slug = normalize(raw);
    return isAvailableShape(slug) ? slug : fallback;
  }

  /**
   * The nth candidate for a base slug: candidate(x, 1) is 'x', then 'x-2',
   * 'x-3', … Used to walk a collision on insert. The base is shortened so the
   * suffix always fits inside MAX_LENGTH.
   */
  public static String candidate(String base, Integer attempt) {
    if (attempt <= 1) {
      return base;
    }
    String suffix = '-' + String.valueOf(attempt);
    Integer room = MAX_LENGTH - suffix.length();
    String head = base.length() > room ? base.left(room) : base;
    return head.replaceAll('-+$', '') + suffix;
  }
}