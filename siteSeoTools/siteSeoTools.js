/**
 * siteSeoTools — client-side SEO output for the site being edited: the
 * document <head> tags a real visitor's browser (and any crawler that
 * executes JS) would see, plus the sitemap.xml / robots.txt text a public
 * domain would need to serve. A plain shared module (like c/sectionRegistry),
 * not a component.
 *
 * There is no public Salesforce Sites/Experience Cloud domain wired up yet —
 * standing one up is an org-wide, security-sensitive change (guest user
 * access) that this module deliberately stays out of. What it DOES do for
 * real: applyDocumentSeo() writes live meta/OG/canonical/robots tags into the
 * actual document head whenever Preview shows a page, so the pipeline from
 * "SEO field in the editor" to "tag in the DOM" is genuinely wired end to
 * end — wherever this shell is ultimately embedded publicly, the tags are
 * already correct.
 */

const MARKER_ATTR = 'data-websuite-seo';
const CSS_ID = 'websuite-custom-css';
let originalTitle = null;

function siteSeo(config) {
    return (config && config.meta && config.meta.seo) || {};
}

/** The effective title for a page: its own SEO title (or page title), plus
 *  the site-wide suffix, e.g. "Book a table | Ruby's Diner". */
export function pageTitle(page, config) {
    const base = (page && page.seo && page.seo.metaTitle) || (page && page.title) || 'Untitled page';
    const suffix = siteSeo(config).titleSuffix;
    return suffix ? `${base} | ${suffix}` : base;
}

export function pageDescription(page, config) {
    return (page && page.seo && page.seo.metaDescription) || (config && config.meta && config.meta.description) || '';
}

export function pageSocialImage(page, config) {
    return (page && page.seo && page.seo.socialImageUrl) || siteSeo(config).defaultSocialImageUrl || '';
}

/** Absolute URL for a page under the site's configured canonical domain, or
 *  null when no domain has been set (nothing to build a canonical tag from). */
export function pageCanonicalUrl(page, config) {
    const domain = (siteSeo(config).canonicalDomain || '').trim().replace(/\/+$/, '');
    if (!domain) {
        return null;
    }
    const origin = /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
    const slug = page && page.slug;
    return page && page.isHome ? origin : `${origin}/${slug || ''}`;
}

function upsertMeta(attr, value, content) {
    if (!content) {
        return;
    }
    const el = document.createElement('meta');
    el.setAttribute(attr, value);
    el.setAttribute('content', content);
    el.setAttribute(MARKER_ATTR, 'true');
    document.head.appendChild(el);
}

/**
 * Write this page's title/meta/OG/canonical/robots tags into the real
 * document head, replacing whatever this module last wrote (so switching
 * pages in Preview updates the tags instead of piling up duplicates). Call
 * clearDocumentSeo() when leaving Preview to restore the editor's own title.
 */
export function applyDocumentSeo(page, config) {
    if (originalTitle === null) {
        originalTitle = document.title;
    }
    clearDocumentSeo(false);

    const title = pageTitle(page, config);
    const description = pageDescription(page, config);
    const image = pageSocialImage(page, config);
    const canonical = pageCanonicalUrl(page, config);
    const robots = siteSeo(config).robotsIndex === false ? 'noindex, nofollow' : 'index, follow';

    document.title = title;
    upsertMeta('name', 'description', description);
    upsertMeta('name', 'robots', robots);
    upsertMeta('property', 'og:title', title);
    upsertMeta('property', 'og:description', description);
    upsertMeta('property', 'og:image', image);
    upsertMeta('property', 'og:type', 'website');
    if (canonical) {
        upsertMeta('property', 'og:url', canonical);
        const link = document.createElement('link');
        link.setAttribute('rel', 'canonical');
        link.setAttribute('href', canonical);
        link.setAttribute(MARKER_ATTR, 'true');
        document.head.appendChild(link);
    }
}

/** Remove every tag applyDocumentSeo() wrote. Restores the editor's own
 *  document title unless `restoreTitle` is explicitly false (mid-swap). */
export function clearDocumentSeo(restoreTitle = true) {
    document.head.querySelectorAll(`[${MARKER_ATTR}]`).forEach((el) => el.remove());
    if (restoreTitle && originalTitle !== null) {
        document.title = originalTitle;
    }
}

/** sitemap.xml text for every in-nav page, under the site's canonical domain.
 *  Returns null when no domain is configured — there's nothing to build
 *  absolute URLs from. */
export function buildSitemapXml(config) {
    const domain = (siteSeo(config).canonicalDomain || '').trim();
    if (!domain) {
        return null;
    }
    const pages = (config.pages || []).filter((p) => p.inNav !== false);
    const urls = pages
        .map((p) => {
            const loc = pageCanonicalUrl(p, config);
            const priority = p.isHome ? '1.0' : '0.7';
            return `  <url>\n    <loc>${escapeXml(loc)}</loc>\n    <priority>${priority}</priority>\n  </url>`;
        })
        .join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/** robots.txt text: allow-all plus a sitemap pointer, or a full-site
 *  disallow when the site-wide "Indexable" toggle is off. */
export function buildRobotsTxt(config) {
    const domain = (siteSeo(config).canonicalDomain || '').trim().replace(/\/+$/, '');
    if (siteSeo(config).robotsIndex === false) {
        return 'User-agent: *\nDisallow: /\n';
    }
    const origin = domain ? (/^https?:\/\//i.test(domain) ? domain : `https://${domain}`) : '';
    return `User-agent: *\nAllow: /\n${origin ? `\nSitemap: ${origin}/sitemap.xml\n` : ''}`;
}

/**
 * Write the site's custom CSS (config.customCode.css) into a real <style> tag
 * in the document head — Preview only (see siteEditorShell), same reasoning
 * as applyDocumentSeo. CSS carries no execution risk the way a <script>
 * would, which is exactly why this exists and an equivalent "custom JS in
 * the shell's own document" doesn't: see sectionEmbed for where arbitrary
 * script IS offered, sandboxed in an iframe instead.
 */
let customCssEl = null;

export function applyCustomCss(config) {
    clearCustomCss();
    const css = (config && config.customCode && config.customCode.css) || '';
    if (!css.trim()) {
        return;
    }
    customCssEl = document.createElement('style');
    customCssEl.id = CSS_ID;
    customCssEl.textContent = css;
    document.head.appendChild(customCssEl);
}

export function clearCustomCss() {
    if (customCssEl) {
        customCssEl.remove();
        customCssEl = null;
    }
}

function escapeXml(value) {
    return String(value || '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}