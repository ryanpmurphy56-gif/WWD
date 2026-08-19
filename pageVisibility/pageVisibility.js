/**
 * pageVisibility — the single rule for "is this page live to the public yet?"
 *
 * Three states, all derived from two optional fields so no saved config needs
 * migrating (an old page with neither field set is live, which is what it
 * always was):
 *
 *   live       — the default. Publicly visible.
 *   draft      — page.status === 'draft'. Exists in the editor, never served.
 *   scheduled  — page.publishAt is a future date. Becomes live on its own.
 *
 * Every consumer that decides what the public sees — the nav builder, the
 * sitemap, the published renderer — asks this, so the three can't drift apart
 * and quietly serve a draft page from one of them.
 *
 * The editor deliberately does NOT filter on this: an author has to be able to
 * see and work on a draft page, so the page rail and canvas show everything
 * and only badge the state.
 *
 * One consumer can't import this: sitemap.xml is served by Apex, so
 * WebsuiteSeoResource.isPageLive() restates the rule. That's the only copy —
 * change one and change the other.
 */

export const PAGE_STATUSES = [
  { value: "live", label: "Live" },
  { value: "draft", label: "Draft — not published" }
];

/**
 * `now` is injected rather than read from the clock so callers that already
 * have a timestamp don't disagree with each other mid-render, and so this
 * stays testable.
 */
export function pageState(page, now = Date.now()) {
  if (!page) {
    return "live";
  }
  if (page.status === "draft") {
    return "draft";
  }
  const at = page.publishAt;
  if (at) {
    const when = Date.parse(at);
    // An unparseable date is treated as "no schedule" rather than hiding the
    // page — failing open is right here; failing closed would silently
    // unpublish a live page over a typo.
    if (!Number.isNaN(when) && when > now) {
      return "scheduled";
    }
  }
  return "live";
}

export function isPageLive(page, now = Date.now()) {
  return pageState(page, now) === "live";
}

/** Only the pages the public should ever see. */
export function livePages(pages, now = Date.now()) {
  return (pages || []).filter((p) => isPageLive(p, now));
}

/** Short label for the editor's page rail / settings panel. */
export function stateLabel(page, now = Date.now()) {
  const state = pageState(page, now);
  if (state === "draft") {
    return "Draft";
  }
  if (state === "scheduled") {
    return "Scheduled";
  }
  return "";
}