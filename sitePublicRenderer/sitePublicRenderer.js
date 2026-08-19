/**
 * sitePublicRenderer — the public, unauthenticated /preview route's only
 * component. Renders ONE WebSuite site's PUBLISHED copy read-only for real
 * visitors. Reuses pageCanvas/sectionSlot/every leaf section exactly as they
 * render today for any non-'edit' mode — confirmed nothing in that chain
 * branches on the string 'preview' specifically, so passing mode="live" here
 * yields the same correct read-only output (no contenteditable, no drag/
 * select chrome, no add-section UI, real nav-header click-through) with zero
 * changes to any section component.
 *
 * Deliberately does NOT import c/siteStateService (the editor's mutation-
 * first singleton) and does NOT reuse siteEditorShell — this talks only to
 * WebsuitePublicSiteController.getPublishedSite(), the one Apex entry point
 * scoped to just this read path, so the Guest Profile's Apex class access
 * grant never has to touch createSite/saveSite/publishSite.
 *
 * Routing: this DX site has no route type that binds a URL path segment to an
 * arbitrary custom object record (only Salesforce CMS Managed Content gets
 * that — see the Preview__c route's doc comment). So site + page are chosen
 * via plain URL query string (?site=<slug-or-Id>&page=<slug>), read directly
 * from window.location rather than lightning/navigation's CurrentPageReference
 * — the parameter names come from c/urlContract, which is the client half of
 * docs/url-contract.md. G1b: `site` accepts a slug or a record Id, and an
 * address that isn't the canonical one is rewritten to it in place (see
 * canonicalise() for why that is replaceState and not an HTTP 301) —
 * a raw browser API sidesteps any uncertainty about how a custom-editor
 * route's PageReference normalizes query state, and nothing here is a real
 * Salesforce record navigation anyway. Switching pages within the same site
 * is then pure client-side state (the full published SiteConfig, every page,
 * is already in memory once loaded) plus history.pushState for a shareable
 * URL — never a second Apex call, same principle as the editor's own
 * activePageId switching.
 *
 * <head> injection (document.title/meta/OG/canonical/JSON-LD) below is
 * client-side only — this app/route type has no SSR mechanism for dynamic
 * per-record head content, so non-JS crawlers (social link-unfurl bots like
 * Facebook/Twitter/Slack) won't see it. Real browsers and JS-executing
 * crawlers (Googlebot) do. sitemap.xml/robots.txt (WebsuiteSeoResource) have
 * no such caveat — they're plain HTTP text, always crawler-visible.
 */
import { LightningElement, track } from "lwc";
import getPublishedSite from "@salesforce/apex/WebsuitePublicSiteController.getPublishedSite";
import { buildNav } from "c/navModel";
import { applyAnalytics, clearAnalytics, trackPageView } from "c/siteAnalytics";
import { buildSchema } from "c/siteSchema";
import { livePages } from "c/pageVisibility";
import { SITE_PARAM, PAGE_PARAM, pageUrl } from "c/urlContract";

const SEO_MARKER = "data-websuite-seo";

export default class SitePublicRenderer extends LightningElement {
  @track config = null;
  loading = true;
  notFound = false;
  siteRef; // whatever ?site= carried in — Id or slug, not yet resolved
  siteId; // the resolved record Id, once known
  activeSlug;

  _lastHeadKey = null;
  _onPopState = () => this.syncSlugFromUrl();

  connectedCallback() {
    const params = new URLSearchParams(window.location.search);
    this.siteRef = params.get(SITE_PARAM);
    this.activeSlug = params.get(PAGE_PARAM);
    window.addEventListener("popstate", this._onPopState);
    this.load();
  }

  disconnectedCallback() {
    window.removeEventListener("popstate", this._onPopState);
    clearAnalytics();
  }

  async load() {
    this.loading = true;
    this.notFound = false;
    if (!this.siteRef) {
      this.loading = false;
      this.notFound = true;
      return;
    }
    try {
      const view = await getPublishedSite({ siteRef: this.siteRef });
      if (!view.isPublished || !view.config) {
        this.notFound = true;
        this.config = null;
      } else {
        this.siteId = view.siteId;
        this.config = JSON.parse(view.config);
        // G1b: the ref in the address bar might be the Id, an old slug, or
        // already-canonical — canonicaliseSite() picks the one the server
        // considers current (view.siteSlug ?? view.siteId) and rewrites in
        // place if that's not what's there now, same replaceState mechanism
        // page-slug redirects already used.
        this.canonicaliseSite(view.siteSlug);
        this.resolveActiveSlug();
        // F11d — armed here and nowhere else: this is the only render path a
        // real visitor ever reaches, so the site owner's numbers never include
        // their own editing sessions.
        applyAnalytics(this.config);
      }
    } catch {
      this.notFound = true;
    } finally {
      this.loading = false;
    }
  }

  // Rewrites ?site= to its canonical form (the slug once the site has one,
  // otherwise the Id) without a reload. Client-side only — same caveat as the
  // page-slug redirect below: this app/route type has no HTTP 301 mechanism,
  // so a bookmark or an already-indexed link keeps working via this rewrite on
  // every load rather than via a server redirect.
  canonicaliseSite(canonicalSlug) {
    const canonical = canonicalSlug || this.siteId;
    if (canonical && canonical !== this.siteRef) {
      this.siteRef = canonical;
      this.updateUrl(this.activeSlug, true, canonical);
    }
  }

  // Applies a redirect (old slug -> new slug) if the requested slug matches
  // one, and rewrites the URL to the canonical slug without a reload —
  // client-side only, see the class doc for why this isn't a real HTTP 301.
  resolveActiveSlug() {
    const redirects = (this.config && this.config.redirects) || [];
    const match = redirects.find(
      (r) => r.fromSlug && r.fromSlug === this.activeSlug
    );
    if (match) {
      this.activeSlug = match.toSlug;
      this.updateUrl(this.activeSlug, true);
    }
  }

  syncSlugFromUrl() {
    const params = new URLSearchParams(window.location.search);
    this.activeSlug = params.get(PAGE_PARAM);
  }

  // Draft and scheduled pages are not part of the public site at all: they
  // don't resolve by slug, don't appear in the menu, and aren't the home
  // fallback. The editor still shows them — see c/pageVisibility.
  get pages() {
    return livePages((this.config && this.config.pages) || []);
  }

  // The slug that renders under a bare ?site= (no &page=). Needed so
  // updateUrl() can tell "navigating to the home page" apart from
  // "navigating to a page that happens to be the fallback" — both must drop
  // the parameter, per docs/url-contract.md §2.
  get homeSlug() {
    const home = this.pages.find((p) => p.isHome) || this.pages[0];
    return home ? home.slug : null;
  }

  get activePage() {
    if (!this.pages.length) {
      return null;
    }
    return (
      this.pages.find((p) => p.slug === this.activeSlug) ||
      this.pages.find((p) => p.isHome) ||
      this.pages[0]
    );
  }

  // siteMarketing targets its campaigns by pageId, but this component addresses
  // pages by slug (that's what the public URL carries) — bridge the two rather
  // than teach either side about the other's identifier.
  get activePageId() {
    const page = this.activePage;
    return page ? page.pageId : undefined;
  }

  get theme() {
    return (this.config && this.config.theme) || {};
  }

  get globals() {
    return (this.config && this.config.globals) || {};
  }

  get navMenu() {
    return buildNav(this.config, { publicOnly: true });
  }

  get showSite() {
    return !this.loading && !this.notFound && !!this.activePage;
  }

  // ---- navigation (nav-header clicks bubble this up from sectionSlot) ---
  handleNavigate(event) {
    const { pageId } = event.detail;
    const target = this.pages.find((p) => p.pageId === pageId);
    if (!target) {
      return;
    }
    this.activeSlug = target.slug;
    this.updateUrl(target.slug, false);
  }

  // Mutates the existing URL rather than rebuilding it from urlContract's
  // pageUrl() — this preserves any other query params a visitor's link
  // carried (UTM tags, etc.), which a from-scratch rebuild would silently
  // drop. `siteRef` is only passed when canonicaliseSite() is rewriting the
  // site half too; ordinary page navigation leaves it as-is.
  updateUrl(pageSlug, replace, siteRef) {
    const url = new URL(window.location.href);
    if (siteRef) {
      url.searchParams.set(SITE_PARAM, siteRef);
    }
    // The home page carries no &page= (docs/url-contract.md §2) — collapse
    // both "no slug given" and "given slug happens to be the home page's".
    const isHome = !pageSlug || pageSlug === this.homeSlug;
    if (isHome) {
      url.searchParams.delete(PAGE_PARAM);
    } else {
      url.searchParams.set(PAGE_PARAM, pageSlug);
    }
    const method = replace ? "replaceState" : "pushState";
    window.history[method](
      { site: siteRef || this.siteRef, page: isHome ? undefined : pageSlug },
      "",
      url.toString()
    );
  }

  // ---- <head> injection (client-side; see class doc for the SSR caveat) -
  renderedCallback() {
    const page = this.activePage;
    if (!page) {
      return;
    }
    const key = `${this.siteId}:${page.pageId}`;
    if (key === this._lastHeadKey) {
      return;
    }
    this._lastHeadKey = key;
    this.applyHead(page);
    // Fired per page, not per document load: switching page here never
    // reloads, so GA's own automatic page_view would only ever see the
    // landing page (see siteAnalytics' send_page_view:false).
    trackPageView(this.config, {
      // Built from urlContract's own pageUrl() rather than hand-assembled, so
      // the analytics path matches the address bar exactly — including
      // dropping &page= for the home page.
      path: pageUrl({
        site: this.siteRef,
        pageSlug: page.slug,
        isHome: page.isHome
      }),
      title: document.title
    });
  }

  applyHead(page) {
    const seo = page.seo || {};
    const businessName =
      (this.config && this.config.meta && this.config.meta.businessName) ||
      "Website";
    const title = seo.metaTitle || `${page.title} — ${businessName}`;
    const description = seo.metaDescription || "";
    const image = seo.socialImageUrl || "";
    const url = window.location.href;

    document.title = title;
    this.setMeta("name", "description", description);
    this.setMeta("property", "og:title", title);
    this.setMeta("property", "og:description", description);
    this.setMeta("property", "og:type", "website");
    this.setMeta("property", "og:url", url);
    if (image) {
      this.setMeta("property", "og:image", image);
    }
    this.setMeta(
      "name",
      "twitter:card",
      image ? "summary_large_image" : "summary"
    );
    this.setLink("canonical", url);
    // F14b: a real @graph (business + page + breadcrumbs + any FAQ) instead of
    // the bare WebSite node F7 emitted, which earned no rich results.
    const schema = buildSchema(page, this.config, { url });
    if (schema) {
      this.setJsonLd(schema);
    }
  }

  setMeta(attr, key, content) {
    if (!content) {
      return;
    }
    let el = document.head.querySelector(
      `meta[${attr}="${key}"][${SEO_MARKER}]`
    );
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute(attr, key);
      el.setAttribute(SEO_MARKER, "true");
      document.head.appendChild(el);
    }
    el.setAttribute("content", content);
  }

  setLink(rel, href) {
    let el = document.head.querySelector(`link[rel="${rel}"][${SEO_MARKER}]`);
    if (!el) {
      el = document.createElement("link");
      el.setAttribute("rel", rel);
      el.setAttribute(SEO_MARKER, "true");
      document.head.appendChild(el);
    }
    el.setAttribute("href", href);
  }

  setJsonLd(data) {
    let el = document.head.querySelector(
      `script[type="application/ld+json"][${SEO_MARKER}]`
    );
    if (!el) {
      el = document.createElement("script");
      el.type = "application/ld+json";
      el.setAttribute(SEO_MARKER, "true");
      document.head.appendChild(el);
    }
    el.textContent = JSON.stringify(data);
  }
}