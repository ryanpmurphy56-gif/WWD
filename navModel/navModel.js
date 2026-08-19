/**
 * navModel — derive the site's navigation menu from its pages plus any custom
 * links. Pure, LEAF module (no store import), so a section can consume the
 * result as a prop and stay presentational — it renders identically in the
 * editor, in preview, and on a future published page.
 *
 * The menu is PAGES-DRIVEN: a page appears when page.inNav is true, in page
 * order; a page's child pages (page.parentId) become its dropdown. Custom links
 * (config.nav.customLinks) are appended after the page items. This is why the
 * menu never drifts from the pages — there is nothing to keep in sync by hand.
 */

function pageItem(page, childPages) {
    const children = childPages.map((c) => ({
        key: c.pageId,
        type: 'page',
        pageId: c.pageId,
        label: c.title,
        slug: c.slug
    }));
    return {
        key: page.pageId,
        type: 'page',
        pageId: page.pageId,
        label: page.title,
        slug: page.slug,
        isHome: !!page.isHome,
        children,
        hasChildren: children.length > 0
    };
}

/**
 * Build the menu for a SiteConfig.
 * Returns `{ items, mobileMenuStyle }` — one object so the whole menu threads as
 * a single prop through the section tree.
 */
export function buildNav(config) {
    const pages = (config && config.pages) || [];
    const nav = (config && config.nav) || {};
    const inNav = (p) => !!(p && p.inNav);

    const items = pages
        .filter((p) => inNav(p) && !p.parentId)
        .map((p) => pageItem(p, pages.filter((c) => inNav(c) && c.parentId === p.pageId)));

    const links = (nav.customLinks || []).map((l) => ({
        key: l.linkId,
        type: 'link',
        linkId: l.linkId,
        label: l.label,
        url: l.url,
        newTab: !!l.newTab,
        children: [],
        hasChildren: false
    }));

    return {
        items: [...items, ...links],
        mobileMenuStyle: nav.mobileMenuStyle || 'dropdown'
    };
}