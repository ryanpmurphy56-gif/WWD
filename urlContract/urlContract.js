/**
 * urlContract — the client half of the URL contract. See docs/url-contract.md,
 * which is the document these rules implement and the place to change them.
 *
 * Everything about what a published WebSuite address looks like lives here: the
 * host path, the query-parameter names, the rule for turning text into a slug,
 * and the builders that assemble an address from those parts. Before this
 * module the path string was copy-pasted into siteHomeHub and restated in a
 * comment in WebsitePublicSite.page, and the slug rule existed only as a
 * private method inside the editor's store.
 *
 * WebsuiteSlug.cls is the Apex restatement of the slug rules — Apex can't
 * import an LWC module, the same unavoidable duplication c/pageVisibility and
 * WebsuiteSeoResource.isPageLive already live with. A change here is a change
 * in three places: here, WebsuiteSlug.cls, and the document.
 */

/**
 * The Visualforce page a classic Salesforce Site serves the renderer from.
 * Not an Experience Cloud route — see §1 of the document for why that was
 * tried, blocked, and abandoned.
 */
export const SITE_PATH = "/WebsitePublicSite";

/** Query parameters the renderer reads out of window.location. */
export const SITE_PARAM = "site";
export const PAGE_PARAM = "page";

/** Text(60) on Website_Site__c.Slug__c; page slugs use the same ceiling. */
export const MAX_SLUG_LENGTH = 60;

/**
 * Names a slug may not take, because a slug becomes a path segment at G1c when
 * a custom domain fronts the Site. Must match WebsuiteSlug.RESERVED.
 */
export const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "apex",
  "apexrest",
  "assets",
  "auth",
  "cms",
  "img",
  "lightning",
  "login",
  "logout",
  "preview",
  "resource",
  "robots",
  "robots-txt",
  "secur",
  "services",
  "servlet",
  "setup",
  "site",
  "sitemap",
  "sitemap-xml",
  "static",
  "websitepublicsite",
  "websuite",
  "www"
]);

/**
 * Lowercase, non-alphanumeric runs collapsed to a single hyphen, trimmed and
 * truncated. Returns "" — never null — for anything that normalises away to
 * nothing, so callers pick their own fallback ("page" for a page, "site" for a
 * site).
 *
 * Apostrophes are deleted rather than hyphenated, so "Ruby's Diner" becomes
 * rubys-diner and not ruby-s-diner. They're the one punctuation mark that
 * appears *inside* a word in a business name, which is exactly the kind of
 * name this has to produce a decent address for.
 */
export function slugify(raw) {
  if (typeof raw !== "string") {
    return "";
  }
  let slug = raw
    .toLowerCase()
    .replace(/['‘’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length > MAX_SLUG_LENGTH) {
    // Truncating can leave a trailing hyphen mid-word — strip it again rather
    // than persisting "my-long-business-".
    slug = slug.slice(0, MAX_SLUG_LENGTH).replace(/-+$/, "");
  }
  return slug;
}

/**
 * True when a slug is exactly the shape of a Salesforce record Id — 15 or 18
 * characters, all alphanumeric, no hyphen.
 *
 * This is the guard that lets ?site= accept either an Id or a slug without
 * ambiguity, which is in turn what keeps every Id-form URL already shared
 * resolving forever (G1b).
 */
export function looksLikeId(slug) {
  return (
    typeof slug === "string" &&
    (slug.length === 15 || slug.length === 18) &&
    /^[a-z0-9]+$/.test(slug)
  );
}

/** Reserved, Id-shaped, or empty — the three ways a slug can be unusable. */
export function isAvailableShape(slug) {
  return !!slug && !RESERVED_SLUGS.has(slug) && !looksLikeId(slug);
}

/**
 * Normalise `raw`, falling back to `fallback` when it normalises to nothing or
 * to a name that isn't allowed.
 */
export function toSlugOr(raw, fallback) {
  const slug = slugify(raw);
  return isAvailableShape(slug) ? slug : fallback;
}

/**
 * A slug not already present in `taken`, suffixed -2, -3, … as needed. `taken`
 * may be a Set or any iterable of strings.
 */
export function uniqueSlug(base, taken) {
  const used = taken instanceof Set ? taken : new Set(taken || []);
  if (!used.has(base)) {
    return base;
  }
  let n = 2;
  // Shorten the base so the suffix always fits inside MAX_SLUG_LENGTH — the
  // same arithmetic as WebsuiteSlug.candidate.
  const room = (suffix) => base.slice(0, MAX_SLUG_LENGTH - suffix.length);
  for (;;) {
    const suffix = `-${n}`;
    const candidate = room(suffix).replace(/-+$/, "") + suffix;
    if (!used.has(candidate)) {
      return candidate;
    }
    n += 1;
  }
}

/**
 * The canonical public address of one page of one site.
 *
 * `site` is the site's slug when it has one and its record Id otherwise — both
 * resolve, and passing the slug is what makes the address readable. The home
 * page deliberately carries NO page parameter: ?site=x and ?site=x&page=home
 * render the same page, but emitting the second as a canonical URL or a sitemap
 * <loc> puts the home page into an index competing with itself.
 *
 * `origin` may be blank (staff opening the editor outside a Site context can't
 * be told which Site would serve this) — the result is then a path, which is
 * still correct and still useful, just not clickable from elsewhere.
 */
export function pageUrl({ origin = "", site, pageSlug, isHome = false } = {}) {
  if (!site) {
    return "";
  }
  const base = `${origin}${SITE_PATH}?${SITE_PARAM}=${encodeURIComponent(site)}`;
  if (isHome || !pageSlug) {
    return base;
  }
  return `${base}&${PAGE_PARAM}=${encodeURIComponent(pageSlug)}`;
}

/** The canonical address of a site's home page. */
export function siteUrl({ origin = "", site } = {}) {
  return pageUrl({ origin, site, isHome: true });
}