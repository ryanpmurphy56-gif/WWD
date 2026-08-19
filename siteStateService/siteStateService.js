/**
 * siteStateService — the one shared store for the whole editor.
 *
 * The entire site being edited is a single SiteConfig JSON document. Every
 * component reads from this store and writes through it; no component holds
 * private site state. The store owns:
 *   - the current SiteConfig
 *   - an undo/redo history stack
 *   - the dirty flag (unsaved changes)
 *   - the backing Salesforce record Id
 *   - save/load via Apex
 *
 * Consumers subscribe() to get notified with an immutable clone on every
 * change, and call the named mutators to change state. Structural edits
 * (move/duplicate/delete) and content edits all funnel through one commit
 * path, so undo/redo and dirty tracking are automatic for every change.
 *
 * This is a plain shared module (like c/websuiteStyles), not a UI component.
 */
import createSiteApex from "@salesforce/apex/WebsuiteSiteController.createSite";
import createSiteForAccountApex from "@salesforce/apex/WebsuiteSiteController.createSiteForAccount";
import saveSiteApex from "@salesforce/apex/WebsuiteSiteController.saveSite";
import loadSiteApex from "@salesforce/apex/WebsuiteSiteController.loadSite";
import publishSiteApex from "@salesforce/apex/WebsuiteSiteController.publishSite";
import submitForReviewApex from "@salesforce/apex/WebsuiteSiteController.submitForReview";
import getSiteSlugApex from "@salesforce/apex/WebsuiteSiteController.getSiteSlug";
import setSiteSlugApex from "@salesforce/apex/WebsuiteSiteController.setSiteSlug";
import { getStoredAccountSession } from "c/websuiteStyles";
import getVersionHistoryApex from "@salesforce/apex/WebsuiteSiteController.getVersionHistory";
import restoreVersionApex from "@salesforce/apex/WebsuiteSiteController.restoreVersion";
import { uuid, defaultSection } from "c/sectionRegistry";
import { toSlugOr, uniqueSlug } from "c/urlContract";
import { personality } from "c/themePresets";
import { setBpValue, clearBpValue } from "c/sectionCommon";
import {
  buildPageSections,
  buildBlankDraft,
  buildFromTemplate,
  exportSiteJson,
  importSiteJson
} from "c/siteTemplates";
import {
  frameFor,
  clampFrame,
  deriveFrame,
  topZ,
  bottomZ,
  blockFromSection,
  blocksFromSections
} from "c/blockModel";

// Re-export so consumers can grab uuid from the store without a second import.
export { uuid };

const RECENT_ASSET_CAP = 24;

/**
 * Find a section anywhere in a page, at any nesting depth. Exported because a
 * plain `page.sections.find()` only ever sees top-level sections — it would
 * return null for anything inside a row's column, and callers that treat null
 * as "gone" would silently drop the selection.
 */
export function findSectionInPage(page, sectionId) {
  if (!page || !sectionId) {
    return null;
  }
  const found = findSectionIn(page.sections || [], sectionId);
  return found ? found.list[found.index] : null;
}

/**
 * True when every id resolves to a section in `page` and all of them share one
 * owning list (all top-level, or all in the same column). Grouping wraps a
 * contiguous run of ONE list in a row; the canvas uses this to disable the
 * Group action for selections that straddle lists.
 */
export function sectionsInSameList(page, sectionIds) {
  if (!page || !sectionIds || sectionIds.length < 2) {
    return false;
  }
  const founds = sectionIds.map((id) => findSectionIn(page.sections || [], id));
  return founds.every((f) => f && f.list === founds[0].list);
}

/**
 * Flatten a page's section tree into a depth-first, indent-aware list — the
 * layers panel's one source of truth for rendering, since LWC has no clean way
 * to have a component recurse into itself for an arbitrarily deep tree.
 * isFirst/isLast are computed per sibling list (matching how moveSection scopes
 * "up/down" to a section's own owning list, never across a row's columns).
 */
export function flattenPageSections(page) {
  const rows = [];
  const walk = (list, depth) => {
    list.forEach((node, i) => {
      rows.push({
        sectionId: node.sectionId,
        node,
        depth,
        isFirst: i === 0,
        isLast: i === list.length - 1
      });
      childListsOf(node).forEach((childList) => walk(childList, depth + 1));
    });
  };
  walk((page && page.sections) || [], 0);
  return rows;
}

const HISTORY_LIMIT = 50;

/**
 * The child lists a section owns. Only rows nest today; keeping this in one
 * place means the tree walk never has to guess where children might live, and a
 * future container type only has to be added here.
 */
function childListsOf(section) {
  if (!section || section.type !== "row") {
    return [];
  }
  return ((section.content && section.content.columns) || [])
    .map((c) => c.children)
    .filter(Array.isArray);
}

/**
 * Reissue every id in a copied subtree. Duplicating a row deep-copies its
 * children, and leaving their ids alone would leave two sections answering to
 * the same id — every lookup would hit whichever the walk reached first, so
 * editing the copy would silently edit the original.
 */
function reidSection(section) {
  section.sectionId = uuid();
  if (section.type === "row") {
    ((section.content && section.content.columns) || []).forEach((col) => {
      col.colId = uuid();
      (col.children || []).forEach(reidSection);
    });
  }
  return section;
}

/**
 * Depth-first search for a section, returning the array that holds it and its
 * index within that array — enough for callers to read, splice or replace it.
 */
function findSectionIn(list, sectionId) {
  for (let i = 0; i < list.length; i += 1) {
    if (list[i].sectionId === sectionId) {
      return { list, index: i };
    }
    const nested = childListsOf(list[i]);
    for (let j = 0; j < nested.length; j += 1) {
      const found = findSectionIn(nested[j], sectionId);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

/** Deep clone via JSON — SiteConfig is always JSON-serializable by contract. */
function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

class SiteStore {
  _config = null;
  _recordId = null;
  _dirty = false;
  _history = [];
  _index = -1;
  _subscribers = new Set();
  // Publish status lives on the Website_Site__c record (Is_Published__c /
  // Published_At__c), NOT inside Config__c — publishing must never touch the
  // draft JSON or the undo history. Kept as plain instance fields rather than
  // routed through _mutate/_notify; consumers read them right after the
  // action that can change them (load/publish/restore).
  _isPublished = false;
  _publishedAt = null;
  _reviewStatus = "Not Submitted";
  _submittedAt = null;
  // The site's public address name (Website_Site__c.Slug__c). On the record
  // rather than in the config for the same reason publish status is: it has to
  // be unique across sites, and only the platform's unique index can enforce
  // that. Blank for sites created before G1a — ?site= still takes the record
  // Id, see docs/url-contract.md.
  _siteSlug = null;
  // Section clipboard for copy/paste across pages. Deliberately NOT part of
  // the config: copying isn't an edit, shouldn't dirty the site, and
  // shouldn't survive into the saved document.
  _clipboard = null;

  // ---- subscription ----------------------------------------------------

  /**
   * Register a listener. It fires immediately with the current state (if any)
   * and on every subsequent change. Returns an unsubscribe function.
   */
  subscribe(callback) {
    this._subscribers.add(callback);
    if (this._config) {
      callback(this.getState());
    }
    return () => this._subscribers.delete(callback);
  }

  _notify() {
    const snapshot = this.getState();
    this._subscribers.forEach((cb) => cb(snapshot));
  }

  // ---- reads -----------------------------------------------------------

  /** Immutable copy of the current SiteConfig — callers must never mutate it. */
  getState() {
    return clone(this._config);
  }

  getRecordId() {
    return this._recordId;
  }

  isDirty() {
    return this._dirty;
  }

  isPublished() {
    return this._isPublished;
  }

  getPublishedAt() {
    return this._publishedAt;
  }

  getReviewStatus() {
    return this._reviewStatus;
  }

  getSubmittedAt() {
    return this._submittedAt;
  }

  getSiteSlug() {
    return this._siteSlug;
  }

  canUndo() {
    return this._index > 0;
  }

  canRedo() {
    return this._index < this._history.length - 1;
  }

  /** Convenience lookup used by mutators and consumers alike. */
  findPage(pageId) {
    return (this._config?.pages || []).find((p) => p.pageId === pageId) || null;
  }

  // ---- lifecycle -------------------------------------------------------

  /**
   * Adopt an existing config as the clean, saved baseline: history is reset
   * to this single state and the dirty flag is cleared. publishStatus is
   * read once from the record, not part of the JSON document (see the
   * fields above) — a new/unsaved site is always unpublished.
   */
  initFromConfig(config, recordId, publishStatus) {
    this._config = this._ensureBlocks(clone(config));
    this._recordId = recordId || null;
    this._history = [JSON.stringify(this._config)];
    this._index = 0;
    this._dirty = false;
    this._isPublished = !!(publishStatus && publishStatus.isPublished);
    this._publishedAt = (publishStatus && publishStatus.publishedAt) || null;
    this._reviewStatus =
      (publishStatus && publishStatus.reviewStatus) || "Not Submitted";
    this._submittedAt = (publishStatus && publishStatus.submittedAt) || null;
    this._siteSlug = (publishStatus && publishStatus.siteSlug) || null;
    this._notify();
  }

  /**
   * Give every page a blocks[] the canvas can author into, migrating from the
   * legacy sections[] the first time a pre-canvas site is opened. Runs on load
   * rather than as a one-off script so a site saved by the old editor always
   * opens with its content visible instead of a blank canvas.
   *
   * sections[] is deliberately left in place: it is the only record of nested
   * rows and global refs, which blocksFromSections skips.
   */
  _ensureBlocks(config) {
    (config?.pages || []).forEach((page) => {
      if (Array.isArray(page.blocks)) {
        return;
      }
      page.blocks = blocksFromSections(page.sections || []);
    });
    return config;
  }

  /** A blank-but-valid SiteConfig with one Home page and a seeded hero. */
  createSeed(meta = {}) {
    const category = meta.category || "default";
    return {
      siteId: uuid(),
      meta: {
        businessName: meta.businessName || "My business",
        tagline: meta.tagline || "",
        category,
        goal: meta.goal || "leads",
        description: meta.description || "",
        contact: { email: "", phone: "", address: "", hours: "" },
        social: { instagram: "", facebook: "", linkedin: "" },
        logoAssetId: null
      },
      theme: {
        personality: meta.personality || "professional",
        palette: {
          primary: "#1F3D5C",
          secondary: "#FF5B04",
          accent: "#FF5B04",
          surface: "#FFFFFF",
          text: "#0A0A0A"
        },
        fontPair: "default",
        radius: "soft",
        spacing: "comfortable",
        motion: "subtle",
        button: { color: "secondary", variant: "solid" },
        link: { color: "inherit", underline: "none" },
        form: { accent: "secondary" },
        heading: { weight: "default", color: "inherit" }
      },
      pages: [
        {
          pageId: uuid(),
          title: "Home",
          slug: "home",
          isHome: true,
          inNav: true,
          parentId: null,
          purpose: "Introduce the business and drive the primary action",
          // sections[] is the legacy stacked model, kept so existing
          // saved sites still open; blocks[] is the canvas model the
          // editor now authors into.
          sections: [],
          blocks: [blockFromSection("hero", category)]
        }
      ],
      history: { savedAt: null, version: 0 }
    };
  }

  /** Start a brand-new, unsaved site from wizard/seed meta. */
  newSite(meta) {
    this.initFromConfig(this.createSeed(meta), null);
    this._dirty = true; // never saved yet
    this._notify();
  }

  /**
   * Adopt a fully-built draft (e.g. from the setup wizard) as a new, unsaved
   * site. Like newSite but takes a complete SiteConfig instead of seed meta.
   */
  startFromDraft(config) {
    this.initFromConfig(config, null);
    this._dirty = true; // never saved yet
    this._notify();
  }

  /**
   * Start a brand-new, unsaved site on a truly blank canvas: one empty Home
   * page, default theme, no sections. This is the "skip the questionnaire"
   * path — the editor's own empty state calls it directly (no navigation, so
   * no sessionStorage handoff needed, unlike the marketing wizard).
   */
  newBlankSite() {
    this.startFromDraft(buildBlankDraft());
  }

  /**
   * Start a new, unsaved site from a whole-site starter template — the
   * "pick one and replace the words" path. Same handoff as newBlankSite; only
   * the page list differs.
   */
  newSiteFromTemplate(templateId, answers = {}) {
    this.startFromDraft(buildFromTemplate(templateId, answers));
  }

  /** This site as a portable JSON file's contents. */
  exportJson() {
    return exportSiteJson(this._config, {
      exportedAt: new Date().toISOString()
    });
  }

  /**
   * Adopt an exported file as a NEW unsaved site. Throws a readable message if
   * the file isn't one of ours; the caller surfaces it.
   */
  importJson(text) {
    this.startFromDraft(importSiteJson(text));
  }

  // ---- commit / history ------------------------------------------------

  /**
   * Replace the working config and record it on the history stack. Any redo
   * branch ahead of the current position is discarded, and the stack is
   * capped so long sessions don't grow without bound.
   */
  _commit(nextConfig) {
    this._config = nextConfig;
    this._history = this._history.slice(0, this._index + 1);
    this._history.push(JSON.stringify(nextConfig));
    if (this._history.length > HISTORY_LIMIT) {
      this._history.shift();
    }
    this._index = this._history.length - 1;
    this._dirty = true;
    this._notify();
  }

  /** Clone → mutate → commit. The mutator receives a private working copy. */
  _mutate(mutator) {
    if (!this._config) {
      return;
    }
    const draft = clone(this._config);
    mutator(draft);
    this._commit(draft);
  }

  undo() {
    if (!this.canUndo()) {
      return;
    }
    this._index -= 1;
    this._config = JSON.parse(this._history[this._index]);
    this._dirty = true;
    this._notify();
  }

  redo() {
    if (!this.canRedo()) {
      return;
    }
    this._index += 1;
    this._config = JSON.parse(this._history[this._index]);
    this._dirty = true;
    this._notify();
  }

  // ---- content & structure mutators -----------------------------------

  /**
   * The node a CONTENT-level edit should land on. For an ordinary section
   * that's the node itself; for a global-block instance ({type:'globalRef',
   * globalId}) it's the shared definition in draft.globals — which is exactly
   * what makes every instance update together. Structural ops (move, delete,
   * duplicate, relocate) intentionally do NOT go through this: they act on
   * the instance.
   */
  _effective(draft, node) {
    if (node && node.type === "globalRef") {
      return (draft.globals || {})[node.globalId] || null;
    }
    return node;
  }

  /**
   * Find a section anywhere in a page and hand its OWNING LIST plus index to
   * `fn`. Sections used to be a flat array on the page; a row can now hold
   * children, so every mutator has to work at depth. Passing the owning list
   * (rather than the page) is what lets move/duplicate/delete splice the right
   * array without caring whether it is the page's or a column's.
   */
  _withSection(draft, pageId, sectionId, fn) {
    const page = (draft.pages || []).find((p) => p.pageId === pageId);
    if (!page) {
      return;
    }
    const found = findSectionIn(page.sections || [], sectionId);
    if (found) {
      fn(found.list, found.index);
    }
  }

  /** Find a row's column by id, anywhere in the page. */
  _withColumn(draft, pageId, rowId, colId, fn) {
    this._withSection(draft, pageId, rowId, (list, i) => {
      const row = list[i];
      const col = (row.content?.columns || []).find((c) => c.colId === colId);
      if (col) {
        col.children = col.children || [];
        fn(col, row);
      }
    });
  }

  updateSectionContent(pageId, sectionId, patch) {
    this._mutate((draft) =>
      this._withSection(draft, pageId, sectionId, (list, i) => {
        const node = this._effective(draft, list[i]);
        if (!node) {
          return;
        }
        node.content = { ...node.content, ...patch };
      })
    );
  }

  /**
   * Patch a section's style at one device. Each value goes through setBpValue,
   * so editing the default device leaves plain scalars alone and only an
   * actual tablet/mobile override turns a field into a breakpoint map.
   */
  updateSectionStyle(pageId, sectionId, patch, device = "base") {
    this._mutate((draft) =>
      this._withSection(draft, pageId, sectionId, (list, i) => {
        const node = this._effective(draft, list[i]);
        if (!node) {
          return;
        }
        const style = { ...node.style };
        Object.keys(patch || {}).forEach((key) => {
          style[key] = setBpValue(style[key], device, patch[key]);
        });
        node.style = style;
      })
    );
  }

  /**
   * Drop every style override this section carries at one device, falling it
   * back to the wider breakpoint. No-op at the default device, which is the
   * base value rather than an override of anything.
   */
  clearSectionStyleOverrides(pageId, sectionId, device) {
    this._mutate((draft) =>
      this._withSection(draft, pageId, sectionId, (list, i) => {
        const node = this._effective(draft, list[i]);
        if (!node) {
          return;
        }
        const style = { ...node.style };
        Object.keys(style).forEach((key) => {
          style[key] = clearBpValue(style[key], device);
        });
        node.style = style;
      })
    );
  }

  /**
   * Move a section one slot up (-1) or down (+1) within its own list; no-op
   * past the ends. A child reorders inside its column, not across columns.
   */
  moveSection(pageId, sectionId, direction) {
    this._mutate((draft) =>
      this._withSection(draft, pageId, sectionId, (list, i) => {
        const target = i + direction;
        if (target < 0 || target >= list.length) {
          return;
        }
        const [moved] = list.splice(i, 1);
        list.splice(target, 0, moved);
      })
    );
  }

  /**
   * Move a section to an arbitrary position anywhere in the page — the drag
   * and drop primitive. `target` is either `{ index }` (page level) or
   * `{ rowId, colId, index }` (a row's column).
   *
   * Invalid drops (unknown ids, or a row dropped into itself / its own
   * descendant — which would detach the subtree into a child of itself and
   * orphan it) are rejected BEFORE _mutate runs, so an aborted drag never
   * pushes a junk entry onto the undo history.
   */
  relocateSection(pageId, sectionId, target = {}) {
    const page = (this._config?.pages || []).find((p) => p.pageId === pageId);
    if (!page || !findSectionIn(page.sections || [], sectionId)) {
      return false;
    }
    if (target.rowId) {
      if (target.rowId === sectionId) {
        return false; // a row dropped onto its own column
      }
      const dragged = findSectionIn(page.sections, sectionId);
      if (findSectionIn([dragged.list[dragged.index]], target.rowId)) {
        return false; // target column lives inside the dragged subtree
      }
      const row = findSectionIn(page.sections, target.rowId);
      const isCol =
        row &&
        (row.list[row.index].content?.columns || []).some(
          (c) => c.colId === target.colId
        );
      if (!isCol) {
        return false;
      }
    }

    this._mutate((draft) => {
      const draftPage = draft.pages.find((p) => p.pageId === pageId);
      const found = findSectionIn(draftPage.sections, sectionId);
      const node = found.list[found.index];

      let destList = draftPage.sections;
      if (target.rowId) {
        const row = findSectionIn(draftPage.sections, target.rowId);
        const col = row.list[row.index].content.columns.find(
          (c) => c.colId === target.colId
        );
        col.children = col.children || [];
        destList = col.children;
      }

      found.list.splice(found.index, 1);
      // target.index is expressed in pre-removal positions. In a same-list
      // move, removing the node shifts everything after it down one, so
      // adjust FIRST and clamp to the shrunken list only after.
      let index = Number(target.index) || 0;
      if (destList === found.list && found.index < index) {
        index -= 1;
      }
      index = Math.max(0, Math.min(index, destList.length));
      destList.splice(index, 0, node);
    });
    return true;
  }

  /**
   * Insert a fresh-id copy directly after the original, in the same list.
   * Duplicating a row deep-copies its children too, so every nested id has to
   * be reissued or the copies would collide with the originals.
   */
  duplicateSection(pageId, sectionId) {
    this._mutate((draft) =>
      this._withSection(draft, pageId, sectionId, (list, i) => {
        const copy = reidSection(clone(list[i]));
        list.splice(i + 1, 0, copy);
      })
    );
  }

  // ---- multi-select bulk mutators ---------------------------------------
  // Each is ONE _mutate call, so a bulk action is a single undo step — undoing
  // a 5-section delete brings all 5 back at once.

  /** Delete several sections in one undo step. Ids nested inside another
   *  deleted id are skipped harmlessly (removing the ancestor removed them). */
  deleteSections(pageId, sectionIds = []) {
    this._mutate((draft) => {
      sectionIds.forEach((id) =>
        this._withSection(draft, pageId, id, (list, i) => {
          list.splice(i, 1);
        })
      );
    });
  }

  /** Duplicate several sections in one undo step, each copy after its original. */
  duplicateSections(pageId, sectionIds = []) {
    this._mutate((draft) => {
      sectionIds.forEach((id) =>
        this._withSection(draft, pageId, id, (list, i) => {
          list.splice(i + 1, 0, reidSection(clone(list[i])));
        })
      );
    });
  }

  /**
   * Wrap several sections in a new single-column row — the "group" primitive.
   * Only valid when every id lives in the SAME list (checked before _mutate,
   * so an invalid group never pushes an undo entry): grouping across lists
   * has no single sensible insertion point. The row lands at the first
   * member's position and members keep their document order inside it.
   * Returns the new row's id, or null when the selection can't be grouped.
   */
  groupSections(pageId, sectionIds = []) {
    const page = this.findPage(pageId);
    if (!page || !sectionsInSameList(page, sectionIds)) {
      return null;
    }
    const row = defaultSection(
      "row",
      this._config?.meta?.category || "default"
    );
    row.content = { columns: [{ colId: uuid(), span: 12, children: [] }] };
    this._mutate((draft) => {
      const draftPage = draft.pages.find((p) => p.pageId === pageId);
      const first = findSectionIn(draftPage.sections || [], sectionIds[0]);
      const list = first.list;
      const indices = sectionIds
        .map((id) => list.findIndex((n) => n.sectionId === id))
        .sort((a, b) => a - b);
      const insertAt = indices[0];
      row.content.columns[0].children = indices.map((i) => list[i]);
      [...indices].reverse().forEach((i) => list.splice(i, 1));
      list.splice(insertAt, 0, row);
    });
    return row.sectionId;
  }

  /**
   * relocateSection for a whole selection: move several sections to `target`
   * as one contiguous block, in document order, in one undo step. Ids nested
   * inside another dragged id are dropped up front (moving the ancestor
   * carries them). Validation mirrors relocateSection and runs before
   * _mutate, so a rejected drop pushes no history entry.
   *
   * Index math differs from relocateSection: with several removals the
   * "subtract what you removed before the target" arithmetic gets fiddly, so
   * instead the insertion point is remembered as an ANCHOR — the first
   * non-dragged node at or after target.index — which survives any number of
   * removals; insert lands before it (or at the end when there is none).
   */
  relocateSections(pageId, sectionIds = [], target = {}) {
    const page = this.findPage(pageId);
    if (!page || !sectionIds.length) {
      return false;
    }
    const founds = sectionIds.map((id) =>
      findSectionIn(page.sections || [], id)
    );
    if (founds.some((f) => !f)) {
      return false;
    }
    const nodeById = new Map(
      sectionIds.map((id, k) => [id, founds[k].list[founds[k].index]])
    );
    const kept = sectionIds.filter(
      (id) =>
        !sectionIds.some(
          (other) => other !== id && findSectionIn([nodeById.get(other)], id)
        )
    );
    if (target.rowId) {
      for (const id of kept) {
        if (
          target.rowId === id ||
          findSectionIn([nodeById.get(id)], target.rowId)
        ) {
          return false; // target column lives inside a dragged subtree
        }
      }
      const row = findSectionIn(page.sections || [], target.rowId);
      const isCol =
        row &&
        (row.list[row.index].content?.columns || []).some(
          (c) => c.colId === target.colId
        );
      if (!isCol) {
        return false;
      }
    }
    // Document order, so the dropped block reads the same way it did on the page.
    const keptSet = new Set(kept);
    const ordered = [];
    const walk = (list) =>
      list.forEach((n) => {
        if (keptSet.has(n.sectionId)) {
          ordered.push(n.sectionId);
        }
        childListsOf(n).forEach(walk);
      });
    walk(page.sections || []);

    this._mutate((draft) => {
      const draftPage = draft.pages.find((p) => p.pageId === pageId);
      let destList = draftPage.sections;
      if (target.rowId) {
        const row = findSectionIn(draftPage.sections, target.rowId);
        const col = row.list[row.index].content.columns.find(
          (c) => c.colId === target.colId
        );
        col.children = col.children || [];
        destList = col.children;
      }
      let anchorId = null;
      for (let i = Number(target.index) || 0; i < destList.length; i += 1) {
        if (!keptSet.has(destList[i].sectionId)) {
          anchorId = destList[i].sectionId;
          break;
        }
      }
      const moved = ordered.map((id) => {
        const f = findSectionIn(draftPage.sections, id);
        return f.list.splice(f.index, 1)[0];
      });
      const at = anchorId
        ? destList.findIndex((n) => n.sectionId === anchorId)
        : destList.length;
      destList.splice(at, 0, ...moved);
    });
    return true;
  }

  /**
   * Align several sections on the 12-column grid in one undo step:
   * 'left' | 'center' | 'right' keep each section's own span and move it;
   * 'full' stretches to the whole grid.
   */
  alignSections(pageId, sectionIds = [], alignment) {
    this._mutate((draft) => {
      sectionIds.forEach((id) =>
        this._withSection(draft, pageId, id, (list, i) => {
          const node = this._effective(draft, list[i]);
          if (!node) {
            return;
          }
          const span = alignment === "full" ? 12 : node.layout?.colSpan || 12;
          let colStart = 1;
          if (alignment === "center") {
            colStart = Math.floor((12 - span) / 2) + 1;
          } else if (alignment === "right") {
            colStart = 13 - span;
          }
          node.layout = { ...node.layout, colStart, colSpan: span };
        })
      );
    });
  }

  /**
   * Spread the selection evenly across the 12-column grid in one undo step:
   * each section (in document order) gets an equal-width slot stepped
   * left→right, so a stack of full-width bands reads as distributed across the
   * page. Complements alignSections (which shares one edge) — this shares the
   * width and the rhythm. No-op for fewer than two sections.
   */
  distributeSections(pageId, sectionIds = []) {
    if (sectionIds.length < 2) {
      return;
    }
    const page = this.findPage(pageId);
    if (!page) {
      return;
    }
    // Order by document position so the left→right step follows the page.
    const chosen = new Set(sectionIds);
    const order = [];
    const walk = (list) =>
      (list || []).forEach((sec) => {
        if (chosen.has(sec.sectionId)) {
          order.push(sec.sectionId);
        }
        childListsOf(sec).forEach(walk);
      });
    walk(page.sections);

    const span = Math.max(1, Math.floor(12 / order.length));
    this._mutate((draft) => {
      order.forEach((id, i) => {
        this._withSection(draft, pageId, id, (list, idx) => {
          const node = this._effective(draft, list[idx]);
          if (!node) {
            return;
          }
          const colStart = Math.min(1 + i * span, 13 - span);
          node.layout = { ...node.layout, colStart, colSpan: span };
        });
      });
    });
  }

  /** Append a new section of `type` to one column of a row. */
  addSectionToColumn(pageId, rowId, colId, type) {
    let newId = null;
    this._mutate((draft) =>
      this._withColumn(draft, pageId, rowId, colId, (col) => {
        const section = defaultSection(type, draft.meta && draft.meta.category);
        newId = section.sectionId;
        col.children.push(section);
      })
    );
    return newId;
  }

  /** Change a row's column count, preserving existing columns and content. */
  setRowColumns(pageId, rowId, count) {
    this._mutate((draft) =>
      this._withSection(draft, pageId, rowId, (list, i) => {
        const row = list[i];
        const cols = (row.content?.columns || []).map((c) => ({ ...c }));
        // Up to 12: grid mode treats columns as wrapping cells, so it
        // legitimately wants more than the 4 that fit side by side.
        const next = Math.max(1, Math.min(12, Number(count) || 1));
        while (cols.length < next) {
          cols.push({ colId: uuid(), span: 0, children: [] });
        }
        // Shrinking: don't destroy work — fold trailing columns' children
        // into the last surviving column rather than deleting them.
        while (cols.length > next) {
          const dropped = cols.pop();
          cols[cols.length - 1].children.push(...(dropped.children || []));
        }
        const span = Math.floor(12 / next);
        cols.forEach((c, idx) => {
          // Give the remainder to the last column so spans total 12.
          c.span = idx === next - 1 ? 12 - span * (next - 1) : span;
        });
        row.content = { ...row.content, columns: cols };
      })
    );
  }

  /**
   * Patch a row's container-level layout settings, all living in content:
   * layoutMode ('columns' | 'flex' | 'grid' — absent means 'columns', so
   * every config saved before modes existed keeps rendering unchanged),
   * flex ({direction, wrap, justify, align}) and gridCols. A `flex` patch
   * merges field-by-field so changing one control never wipes the others.
   */
  updateRowLayout(pageId, rowId, patch) {
    this._mutate((draft) =>
      this._withSection(draft, pageId, rowId, (list, i) => {
        const row = list[i];
        if (row.type !== "row") {
          return;
        }
        const next = { ...row.content };
        Object.keys(patch || {}).forEach((key) => {
          if (key === "flex") {
            next.flex = { ...next.flex, ...patch.flex };
          } else {
            next[key] = patch[key];
          }
        });
        row.content = next;
      })
    );
  }

  /**
   * Patch one column's sizing (widthMode / span / percent). These live on the
   * column itself, beside the existing `span` — an absent widthMode means
   * 'span', so old configs need no migration.
   */
  updateRowColumn(pageId, rowId, colId, patch) {
    this._mutate((draft) =>
      this._withColumn(draft, pageId, rowId, colId, (col) => {
        Object.assign(col, patch);
      })
    );
  }

  deleteSection(pageId, sectionId) {
    this._mutate((draft) =>
      this._withSection(draft, pageId, sectionId, (list, i) => {
        list.splice(i, 1);
      })
    );
  }

  updateSectionVariant(pageId, sectionId, variant) {
    this._mutate((draft) =>
      this._withSection(draft, pageId, sectionId, (list, i) => {
        const node = this._effective(draft, list[i]);
        if (node) {
          node.variant = variant;
        }
      })
    );
  }

  /** Patch a section's grid placement (colStart / colSpan / valign). */
  updateSectionLayout(pageId, sectionId, patch) {
    this._mutate((draft) =>
      this._withSection(draft, pageId, sectionId, (list, i) => {
        const node = this._effective(draft, list[i]);
        if (node) {
          node.layout = { ...node.layout, ...patch };
        }
      })
    );
  }

  /**
   * Patch one content field's typography override (font size/weight/line
   * height/letter spacing/text shadow) on a section — e.g. a hero's heading
   * sized independently of its subheading. Goes through _effective(), like
   * updateSectionContent/updateSectionStyle, so a global block's field
   * typography is shared across every page that uses it — unlike flags
   * (below), which are deliberately per-instance.
   */
  updateFieldStyle(pageId, sectionId, fieldKey, patch) {
    this._mutate((draft) =>
      this._withSection(draft, pageId, sectionId, (list, i) => {
        const node = this._effective(draft, list[i]);
        if (!node) {
          return;
        }
        const fields = { ...(node.style?.fields || {}) };
        fields[fieldKey] = { ...fields[fieldKey], ...patch };
        node.style = { ...node.style, fields };
      })
    );
  }

  /**
   * Patch a section's entrance animation (type/trigger/duration/delay).
   * Deliberately its own mutator rather than routed through
   * updateSectionStyle: every other style field is breakpoint-aware
   * (setBpValue), but an animation isn't something that makes sense to vary
   * per device, so it's stored as a single plain object at
   * `style.animation` instead of a breakpoint map. Goes through
   * _effective() like content/style, so a global block's animation is
   * shared across every placement — same reasoning as updateSectionStyle.
   */
  /**
   * Per-device visibility and mobile ordering. Kept as plain scalars on
   * style (style.hideOn / style.mobileOrder) rather than going through
   * updateSectionStyle's per-breakpoint machinery — these ARE the
   * breakpoint-aware bit, so wrapping them per breakpoint would be circular.
   */
  updateSectionResponsive(pageId, sectionId, patch) {
    this._mutate((draft) =>
      this._withSection(draft, pageId, sectionId, (list, i) => {
        const node = this._effective(draft, list[i]);
        if (!node) {
          return;
        }
        const style = { ...node.style };
        if (patch.hideOn) {
          style.hideOn = { ...style.hideOn, ...patch.hideOn };
        }
        if ("mobileOrder" in patch) {
          style.mobileOrder = patch.mobileOrder;
        }
        node.style = style;
      })
    );
  }

  updateSectionAnimation(pageId, sectionId, patch) {
    this._mutate((draft) =>
      this._withSection(draft, pageId, sectionId, (list, i) => {
        const node = this._effective(draft, list[i]);
        if (!node) {
          return;
        }
        const animation = { ...(node.style && node.style.animation), ...patch };
        node.style = { ...node.style, animation };
      })
    );
  }

  /**
   * Patch a section's editor-only flags (locked / hidden). Unlike content,
   * style and layout, flags apply to the INSTANCE, not the shared global
   * definition — locking or hiding one placement of a global block must not
   * affect its other placements on other pages, so this deliberately writes
   * `list[i]` directly instead of going through `_effective()`.
   */
  setSectionFlags(pageId, sectionId, patch) {
    this._mutate((draft) =>
      this._withSection(draft, pageId, sectionId, (list, i) => {
        list[i].flags = { ...list[i].flags, ...patch };
      })
    );
  }

  // ---- free-canvas blocks -------------------------------------------------
  // The canvas page model: page.blocks[] is a FLAT list of absolutely
  // positioned blocks (see c/blockModel). Unlike sections there is no nesting,
  // so these mutators are all plain finds — no _withSection-style tree walk.
  // Geometry is written per breakpoint; everything else is shared across them.

  _withBlock(draft, pageId, blockId, fn) {
    const page = (draft.pages || []).find((p) => p.pageId === pageId);
    if (!page || !Array.isArray(page.blocks)) {
      return;
    }
    const i = page.blocks.findIndex((b) => b.blockId === blockId);
    if (i >= 0) {
      fn(page.blocks, i, page);
    }
  }

  _blocksOf(draft, pageId) {
    const page = (draft.pages || []).find((p) => p.pageId === pageId);
    if (!page) {
      return null;
    }
    page.blocks = page.blocks || [];
    return page;
  }

  /** Append a ready-made block (from blockFromSection/blockFromElement). */
  addBlock(pageId, block) {
    if (!block) {
      return null;
    }
    this._mutate((draft) => {
      const page = this._blocksOf(draft, pageId);
      if (page) {
        page.blocks.push({ ...block, z: topZ(page.blocks) });
      }
    });
    return block.blockId;
  }

  /**
   * Write geometry for ONE breakpoint. Deliberately scoped to a single
   * breakpoint: moving a block on mobile must never disturb where the author
   * placed it on desktop — that independence is the whole point of
   * per-breakpoint editing.
   */
  updateBlockFrame(pageId, blockId, breakpoint, patch) {
    this._mutate((draft) =>
      this._withBlock(draft, pageId, blockId, (blocks, i) => {
        const block = blocks[i];
        block.frame = block.frame || {};
        // frameFor() resolves an untouched breakpoint to a derived copy
        // of desktop; materialise that here so the first nudge on
        // tablet/mobile edits the derived position rather than snapping
        // back to a bare default.
        const current = frameFor(block, breakpoint);
        block.frame[breakpoint] = clampFrame(
          { ...current, ...patch },
          breakpoint
        );
      })
    );
  }

  /**
   * Commit geometry for MANY blocks in one history entry. The canvas holds
   * live frames locally while a gesture is in flight and calls this once on
   * release — writing per pointermove would push dozens of entries per drag,
   * making undo useless and re-cloning the whole config every frame.
   */
  updateBlockFrames(pageId, breakpoint, framesById = {}) {
    const ids = Object.keys(framesById);
    if (!ids.length) {
      return;
    }
    this._mutate((draft) => {
      const page = this._blocksOf(draft, pageId);
      if (!page) {
        return;
      }
      page.blocks.forEach((block) => {
        const next = framesById[block.blockId];
        if (!next) {
          return;
        }
        block.frame = block.frame || {};
        block.frame[breakpoint] = clampFrame(
          { ...frameFor(block, breakpoint), ...next },
          breakpoint
        );
      });
    });
  }

  updateBlockContent(pageId, blockId, patch) {
    this._mutate((draft) =>
      this._withBlock(draft, pageId, blockId, (blocks, i) => {
        blocks[i].content = { ...blocks[i].content, ...patch };
      })
    );
  }

  updateBlockStyle(pageId, blockId, patch) {
    this._mutate((draft) =>
      this._withBlock(draft, pageId, blockId, (blocks, i) => {
        blocks[i].style = { ...blocks[i].style, ...patch };
      })
    );
  }

  updateBlockVariant(pageId, blockId, variant) {
    this._mutate((draft) =>
      this._withBlock(draft, pageId, blockId, (blocks, i) => {
        blocks[i].variant = variant;
      })
    );
  }

  setBlockFlags(pageId, blockId, patch) {
    this._mutate((draft) =>
      this._withBlock(draft, pageId, blockId, (blocks, i) => {
        blocks[i].flags = { ...blocks[i].flags, ...patch };
      })
    );
  }

  /** Pin a block's height to its stored frame, or let its content drive it. */
  setBlockAutoHeight(pageId, blockId, autoHeight) {
    this._mutate((draft) =>
      this._withBlock(draft, pageId, blockId, (blocks, i) => {
        blocks[i].autoHeight = autoHeight === true;
      })
    );
  }

  deleteBlocks(pageId, blockIds = []) {
    if (!blockIds.length) {
      return;
    }
    const ids = new Set(blockIds);
    this._mutate((draft) => {
      const page = this._blocksOf(draft, pageId);
      if (page) {
        page.blocks = page.blocks.filter((b) => !ids.has(b.blockId));
      }
    });
  }

  /** Copy blocks, offset slightly so the duplicate is visibly its own object. */
  duplicateBlocks(pageId, blockIds = [], breakpoint = "desktop") {
    const created = [];
    if (!blockIds.length) {
      return created;
    }
    this._mutate((draft) => {
      const page = this._blocksOf(draft, pageId);
      if (!page) {
        return;
      }
      let z = topZ(page.blocks);
      blockIds.forEach((id) => {
        const source = page.blocks.find((b) => b.blockId === id);
        if (!source) {
          return;
        }
        const copy = clone(source);
        copy.blockId = uuid();
        copy.z = z;
        z += 1;
        const f = frameFor(copy, breakpoint);
        copy.frame = {
          ...copy.frame,
          [breakpoint]: clampFrame(
            { ...f, x: f.x + 24, y: f.y + 24 },
            breakpoint
          )
        };
        page.blocks.push(copy);
        created.push(copy.blockId);
      });
    });
    return created;
  }

  bringBlockToFront(pageId, blockId) {
    this._mutate((draft) =>
      this._withBlock(draft, pageId, blockId, (blocks, i) => {
        blocks[i].z = topZ(blocks);
      })
    );
  }

  sendBlockToBack(pageId, blockId) {
    this._mutate((draft) =>
      this._withBlock(draft, pageId, blockId, (blocks, i) => {
        blocks[i].z = bottomZ(blocks);
      })
    );
  }

  /**
   * Copy every block's geometry from one breakpoint onto another, scaled.
   * Without this, "edit each breakpoint separately" means laying the page out
   * three times from nothing; with it, tablet/mobile start as a proportional
   * copy the author then adjusts.
   */
  copyLayoutToBreakpoint(pageId, fromBreakpoint, toBreakpoint) {
    this._mutate((draft) => {
      const page = this._blocksOf(draft, pageId);
      if (!page) {
        return;
      }
      page.blocks.forEach((block) => {
        const source = frameFor(block, fromBreakpoint);
        block.frame = block.frame || {};
        block.frame[toBreakpoint] = clampFrame(
          deriveFrame(source, fromBreakpoint, toBreakpoint),
          toBreakpoint
        );
      });
    });
  }

  // ---- business contact & social links -----------------------------------
  // Seeded (empty) by createSeed() but had no mutator or renderer until now —
  // meta.contact/meta.social existed in the schema and nowhere else.

  updateSiteContact(patch) {
    this._mutate((draft) => {
      draft.meta = draft.meta || {};
      draft.meta.contact = { ...draft.meta.contact, ...patch };
    });
  }

  updateSiteSocial(patch) {
    this._mutate((draft) => {
      draft.meta = draft.meta || {};
      draft.meta.social = { ...draft.meta.social, ...patch };
    });
  }

  // ---- marketing: announcement bar & promo popups ------------------------
  // Both live in config.marketing (created lazily). F11 shipped a single
  // popup (marketing.popup); F11b replaced it with a list of campaigns
  // (marketing.popups), each with its own schedule and targeting. The old
  // single popup is folded into the list on first touch — see _popups.

  _marketing(draft) {
    draft.marketing = draft.marketing || {};
    return draft.marketing;
  }

  /**
   * The campaign list, migrating F11's lone `popup` into it the first time
   * this runs. Done lazily here rather than in initFromConfig so a config that
   * is only ever read (preview, published render) is never rewritten — the
   * renderer handles both shapes on its own.
   */
  _popups(draft) {
    const m = this._marketing(draft);
    if (!Array.isArray(m.popups)) {
      const legacy = m.popup;
      m.popups =
        legacy && Object.keys(legacy).length
          ? [
              {
                ...legacy,
                id: legacy.id || uuid(),
                name: legacy.name || "Promo"
              }
            ]
          : [];
      delete m.popup;
    }
    return m.popups;
  }

  updateAnnouncementBar(patch) {
    this._mutate((draft) => {
      const m = this._marketing(draft);
      m.announcementBar = { ...m.announcementBar, ...patch };
    });
  }

  addPopupCampaign() {
    let newId;
    this._mutate((draft) => {
      const popups = this._popups(draft);
      newId = uuid();
      popups.push({
        id: newId,
        name: `Campaign ${popups.length + 1}`,
        enabled: false,
        heading: "",
        body: "",
        ctaLabel: "",
        ctaTarget: "",
        trigger: "delay",
        // F11e: "center" is the original modal; "slide" is a corner card that
        // doesn't block the page.
        style: "center",
        delaySeconds: 5,
        scrollPercent: 50,
        dismissDays: 7,
        // scheduling + targeting: blank means "no limit", so a new campaign
        // behaves exactly like an F11 popup until someone narrows it
        startDate: "",
        endDate: "",
        targetPageIds: [],
        targetDevice: "all"
      });
    });
    return newId;
  }

  updatePopupCampaign(popupId, patch) {
    this._mutate((draft) => {
      const popups = this._popups(draft);
      const at = popups.findIndex((p) => p.id === popupId);
      if (at !== -1) {
        popups[at] = { ...popups[at], ...patch };
      }
    });
  }

  removePopupCampaign(popupId) {
    this._mutate((draft) => {
      const popups = this._popups(draft);
      const at = popups.findIndex((p) => p.id === popupId);
      if (at !== -1) {
        popups.splice(at, 1);
      }
    });
  }

  /**
   * Order matters: when two campaigns are both eligible for the same visit,
   * the earlier one in the list wins (only one popup ever shows at a time).
   */
  movePopupCampaign(popupId, delta) {
    this._mutate((draft) => {
      const popups = this._popups(draft);
      const at = popups.findIndex((p) => p.id === popupId);
      const to = at + delta;
      if (at === -1 || to < 0 || to >= popups.length) {
        return;
      }
      const [moved] = popups.splice(at, 1);
      popups.splice(to, 0, moved);
    });
  }

  // ---- custom code (F14) -------------------------------------------------
  // Site-wide custom CSS only — see siteSeoTools.applyCustomCss for why raw
  // <script> injection into the shell's own document is deliberately not
  // offered here (per-element script embeds go through sectionEmbed's
  // sandboxed iframe instead, a materially different trust boundary).

  updateCustomCss(css) {
    this._mutate((draft) => {
      draft.customCode = { ...draft.customCode, css };
    });
  }

  // ---- redirects (F14b) --------------------------------------------------
  // config.redirects is a list of { id, fromSlug, toSlug }. The published
  // renderer already honoured this list (sitePublicRenderer.resolveActiveSlug,
  // written during F7b) but nothing could create an entry — F14b added the
  // authoring side.
  //
  // Client-side only, and deliberately described that way in the UI: this is a
  // slug swap plus history.replaceState, not an HTTP 301. Search engines will
  // not transfer ranking through it. A real 301 needs a URL-rewriting layer
  // this platform doesn't give the site (see sitePublicRenderer's class doc).

  _redirects(draft) {
    if (!Array.isArray(draft.redirects)) {
      draft.redirects = [];
    }
    return draft.redirects;
  }

  addRedirect() {
    let newId;
    this._mutate((draft) => {
      newId = uuid();
      this._redirects(draft).push({ id: newId, fromSlug: "", toSlug: "" });
    });
    return newId;
  }

  updateRedirect(redirectId, patch) {
    this._mutate((draft) => {
      const list = this._redirects(draft);
      const at = list.findIndex((r) => r.id === redirectId);
      if (at !== -1) {
        list[at] = { ...list[at], ...patch };
      }
    });
  }

  removeRedirect(redirectId) {
    this._mutate((draft) => {
      const list = this._redirects(draft);
      const at = list.findIndex((r) => r.id === redirectId);
      if (at !== -1) {
        list.splice(at, 1);
      }
    });
  }

  // ---- analytics (F11d) --------------------------------------------------
  // Just the ids: the tag itself is loaded by c/siteAnalytics on the published
  // site only. Kept in config.analytics (created lazily) so old configs need
  // no migration.

  updateAnalytics(patch) {
    this._mutate((draft) => {
      draft.analytics = { ...draft.analytics, ...patch };
    });
  }

  // ---- site-wide SEO defaults -------------------------------------------
  // Per-page overrides live on page.seo (updatePageSeo, above); these are the
  // site-wide fallbacks a page falls back to when it hasn't set its own —
  // title suffix, default share image, robots indexing, and the canonical
  // domain used to build absolute URLs for sitemap.xml/canonical tags.
  // Kept in meta.seo (created lazily) so old configs need no migration.

  updateSiteSeo(patch) {
    this._mutate((draft) => {
      draft.meta = draft.meta || {};
      draft.meta.seo = { ...draft.meta.seo, ...patch };
    });
  }

  // ---- theme mutators --------------------------------------------------

  updateTheme(patch) {
    this._mutate((draft) => {
      draft.theme = { ...draft.theme, ...patch };
    });
  }

  updatePalette(patch) {
    this._mutate((draft) => {
      draft.theme.palette = { ...draft.theme.palette, ...patch };
    });
  }

  /**
   * Field-by-field merge for one of the theme's nested style groups
   * (button/link/form/heading/typography) -- same shape as updatePalette above,
   * generalised to any group key so e.g. `updateThemeGroup('button',
   * {variant:'outline'})` doesn't drop that group's other fields the way a
   * plain updateTheme merge would.
   */
  updateThemeGroup(key, patch) {
    this._mutate((draft) => {
      draft.theme[key] = { ...draft.theme[key], ...patch };
    });
  }

  /**
   * Apply a personality preset as a bundle: palette direction, font pairing,
   * radius, spacing, motion, and button/link/form/heading styling all move
   * together, restyling the whole site. Presets that don't set the newer
   * button/link/form/heading fields fall back to today's neutral defaults.
   */
  applyPersonality(id) {
    const preset = personality(id);
    if (!preset) {
      return;
    }
    this._mutate((draft) => {
      draft.theme.personality = id;
      draft.theme.palette = { ...preset.palette };
      draft.theme.fontPair = preset.fontPair;
      draft.theme.radius = preset.radius;
      draft.theme.spacing = preset.spacing;
      draft.theme.motion = preset.motion;
      draft.theme.button = preset.button
        ? { ...preset.button }
        : { color: "secondary", variant: "solid" };
      draft.theme.link = preset.link
        ? { ...preset.link }
        : { color: "inherit", underline: "none" };
      draft.theme.form = preset.form
        ? { ...preset.form }
        : { accent: "secondary" };
      draft.theme.heading = preset.heading
        ? { ...preset.heading }
        : { weight: "default", color: "inherit" };
    });
  }

  /**
   * Add a section of `type` (seeded from the registry for the site category)
   * to a page. Appends by default, or inserts at `atIndex` when provided.
   * Returns the new section's id so callers can select it immediately.
   */
  addSection(pageId, type, atIndex) {
    const category = this._config?.meta?.category || "default";
    const section = defaultSection(type, category);
    this._mutate((draft) => {
      const page = (draft.pages || []).find((p) => p.pageId === pageId);
      if (!page) {
        return;
      }
      page.sections = page.sections || [];
      const index = atIndex == null ? page.sections.length : atIndex;
      page.sections.splice(index, 0, section);
    });
    return section.sectionId;
  }

  /**
   * Insert a fully-built section node (a prebuilt layout or a preset) into a
   * page. Every id in the node is reissued first, so inserting the same
   * source twice never produces colliding ids. Returns the new section's id.
   */
  addSectionNode(pageId, node, atIndex) {
    if (!node) {
      return null;
    }
    const section = reidSection(clone(node));
    this._mutate((draft) => {
      const page = (draft.pages || []).find((p) => p.pageId === pageId);
      if (!page) {
        return;
      }
      page.sections = page.sections || [];
      const index = atIndex == null ? page.sections.length : atIndex;
      page.sections.splice(index, 0, section);
    });
    return section.sectionId;
  }

  // ---- copy / paste across pages -----------------------------------------

  /** Copy a section to the editor clipboard. Copying a global instance keeps
   *  it a linked instance — paste it and both stay in sync. */
  copySection(pageId, sectionId) {
    const node = findSectionInPage(this.findPage(pageId), sectionId);
    if (!node) {
      return false;
    }
    this._clipboard = { node: clone(node) };
    this._notify(); // not an edit, but the shell's Paste button keys off it
    return true;
  }

  /** What's on the clipboard (type only), or null. */
  getClipboard() {
    if (!this._clipboard) {
      return null;
    }
    const { node } = this._clipboard;
    return { type: node.type === "globalRef" ? "global block" : node.type };
  }

  /** Paste the copied section onto a page (any page). Returns the new id. */
  pasteSection(pageId) {
    return this._clipboard
      ? this.addSectionNode(pageId, this._clipboard.node)
      : null;
  }

  // ---- global blocks ------------------------------------------------------
  // A global block is one shared definition in config.globals plus any number
  // of {type:'globalRef', globalId} instances on pages. Content-level edits on
  // any instance redirect to the definition (see _effective), so every
  // instance updates together. Rows can't be global: their nested children
  // live outside page.sections and the tree walk couldn't reach them.

  /** Convert a section into a global block. Returns the globalId, or null. */
  makeSectionGlobal(pageId, sectionId) {
    const node = findSectionInPage(this.findPage(pageId), sectionId);
    if (!node || node.type === "globalRef" || node.type === "row") {
      return null;
    }
    const globalId = uuid();
    this._mutate((draft) => {
      this._withSection(draft, pageId, sectionId, (list, i) => {
        draft.globals = draft.globals || {};
        draft.globals[globalId] = clone(list[i]);
        list[i] = { sectionId: list[i].sectionId, type: "globalRef", globalId };
      });
    });
    return globalId;
  }

  /** Replace a global instance with an independent local copy. */
  detachGlobal(pageId, sectionId) {
    this._mutate((draft) => {
      this._withSection(draft, pageId, sectionId, (list, i) => {
        const ref = list[i];
        const source =
          ref.type === "globalRef" && (draft.globals || {})[ref.globalId];
        if (!source) {
          return;
        }
        const copy = reidSection(clone(source));
        copy.sectionId = ref.sectionId; // keep the instance id: selection survives
        list[i] = copy;
      });
    });
  }

  /** Append a new linked instance of an existing global block. */
  addGlobalInstance(pageId, globalId) {
    if (!(this._config?.globals || {})[globalId]) {
      return null;
    }
    const instance = { sectionId: uuid(), type: "globalRef", globalId };
    this._mutate((draft) => {
      const page = (draft.pages || []).find((p) => p.pageId === pageId);
      if (page) {
        page.sections = page.sections || [];
        page.sections.push(instance);
      }
    });
    return instance.sectionId;
  }

  /** The global blocks that exist, for the section library's picker. */
  globalsList() {
    const globals = this._config?.globals || {};
    return Object.keys(globals).map((globalId) => ({
      globalId,
      type: globals[globalId].type,
      heading: (globals[globalId].content || {}).heading || ""
    }));
  }

  // ---- section presets --------------------------------------------------
  // Presets live in the SiteConfig itself (config.presets), so they ride the
  // existing save/load path and undo history for free. That makes them
  // per-site; promoting them to cross-site reuse would mean a new object.

  /**
   * Snapshot a section (subtree and all) as a named preset. Returns the
   * preset id, or null when the section doesn't exist.
   */
  saveSectionPreset(pageId, sectionId, name) {
    let node = findSectionInPage(this.findPage(pageId), sectionId);
    if (node && node.type === "globalRef") {
      // Snapshot the definition, not the pointer — a preset must stand alone.
      node = (this._config?.globals || {})[node.globalId] || null;
    }
    if (!node) {
      return null;
    }
    const preset = {
      presetId: uuid(),
      name: (name || "").trim() || "My section",
      type: node.type,
      node: clone(node)
    };
    this._mutate((draft) => {
      draft.presets = draft.presets || [];
      draft.presets.push(preset);
    });
    return preset.presetId;
  }

  deleteSectionPreset(presetId) {
    this._mutate((draft) => {
      draft.presets = (draft.presets || []).filter(
        (p) => p.presetId !== presetId
      );
    });
  }

  /** Insert a saved preset into a page. Returns the new section's id. */
  addSectionFromPreset(pageId, presetId) {
    const preset = (this._config?.presets || []).find(
      (p) => p.presetId === presetId
    );
    return preset ? this.addSectionNode(pageId, preset.node) : null;
  }

  // ---- page mutators ---------------------------------------------------

  /**
   * Text to a page slug, falling back to "page" for anything that normalises
   * away to nothing or lands on a reserved name. The rule itself lives in
   * c/urlContract — see docs/url-contract.md.
   */
  _slugify(title) {
    return toSlugOr(title, "page");
  }

  /**
   * A slug guaranteed not to collide with any existing page's slug (optionally
   * ignoring one page, e.g. the page being renamed). Appends -2, -3, … as
   * needed. Reads the live config, so callers compute it before _mutate.
   */
  _uniqueSlug(base, excludePageId) {
    const taken = (this._config?.pages || [])
      .filter((p) => p.pageId !== excludePageId)
      .map((p) => p.slug);
    return uniqueSlug(base || "page", taken);
  }

  /** Append a new empty page. Returns its id for immediate selection. */
  addPage(title = "New page") {
    const page = {
      pageId: uuid(),
      title,
      slug: this._uniqueSlug(this._slugify(title)),
      isHome: false,
      inNav: true,
      parentId: null,
      purpose: "",
      sections: []
    };
    this._mutate((draft) => {
      draft.pages = draft.pages || [];
      draft.pages.push(page);
    });
    return page.pageId;
  }

  /**
   * Append a new page seeded from a page template (a named list of section
   * types, built via c/siteTemplates against the site category). 'blank' seeds
   * no sections. Returns the new page's id.
   */
  addPageFromTemplate(templateId, title = "New page") {
    const category = this._config?.meta?.category || "default";
    const sections = buildPageSections(templateId, { category });
    const page = {
      pageId: uuid(),
      title,
      slug: this._uniqueSlug(this._slugify(title)),
      isHome: false,
      inNav: true,
      parentId: null,
      purpose: "",
      sections
    };
    this._mutate((draft) => {
      draft.pages = draft.pages || [];
      draft.pages.push(page);
    });
    return page.pageId;
  }

  /**
   * Deep-copy a page (sections and all) directly after the original. Every
   * section/column id is reissued (reidSection) so the copy is fully
   * independent; the copy is never Home and gets a unique slug. A duplicated
   * child keeps its parent, so it lands next to its sibling.
   */
  duplicatePage(pageId) {
    const src = this.findPage(pageId);
    if (!src) {
      return null;
    }
    const copy = clone(src);
    copy.pageId = uuid();
    copy.isHome = false;
    copy.title = `${src.title} copy`;
    copy.slug = this._uniqueSlug(this._slugify(copy.title));
    (copy.sections || []).forEach(reidSection);
    this._mutate((draft) => {
      const i = draft.pages.findIndex((p) => p.pageId === pageId);
      draft.pages.splice(i + 1, 0, copy);
    });
    return copy.pageId;
  }

  /**
   * Nest a page under a parent (dropdown child) or clear its parent
   * (parentId=null). Nesting is capped at ONE level: the target parent must be
   * top-level, and a page that already has its own children can't become a
   * child. Invalid requests are ignored (no history entry).
   */
  setPageParent(pageId, parentId) {
    const pages = this._config?.pages || [];
    const page = pages.find((p) => p.pageId === pageId);
    if (!page) {
      return;
    }
    if (parentId) {
      const parent = pages.find((p) => p.pageId === parentId);
      if (!parent || parent.pageId === pageId || parent.parentId) {
        return; // unknown, self, or would create a second level
      }
      if (pages.some((p) => p.parentId === pageId)) {
        return; // this page is itself a parent — can't also be a child
      }
    }
    this._mutate((draft) => {
      const p = draft.pages.find((x) => x.pageId === pageId);
      if (p) {
        p.parentId = parentId || null;
      }
    });
  }

  /**
   * Remove a page. Refuses to delete the last page; reassigns Home if needed.
   * Any child pages are promoted to top-level (parentId cleared) rather than
   * left pointing at a page that no longer exists.
   */
  deletePage(pageId) {
    if ((this._config?.pages || []).length <= 1) {
      return;
    }
    this._mutate((draft) => {
      const i = draft.pages.findIndex((p) => p.pageId === pageId);
      if (i === -1) {
        return;
      }
      const wasHome = draft.pages[i].isHome;
      draft.pages.splice(i, 1);
      draft.pages.forEach((p) => {
        if (p.parentId === pageId) {
          p.parentId = null;
        }
      });
      if (wasHome && draft.pages.length && !draft.pages.some((p) => p.isHome)) {
        draft.pages[0].isHome = true;
      }
    });
  }

  /**
   * Patch page-level settings (title, slug, inNav, purpose).
   *
   * A slug in the patch is normalised and de-duplicated exactly like a
   * generated one, rather than stored as typed. It used to be written verbatim,
   * so the settings panel's slug field could put "About Us!" or a second copy
   * of an existing page's slug into the config — the first is not a URL and the
   * second makes one of the two pages unreachable, since the public renderer
   * resolves by the first slug match. Uniqueness within a site has no server
   * to enforce it (Apex treats Config__c as opaque), so this method is it.
   */
  updatePage(pageId, patch) {
    this._mutate((draft) => {
      const page = draft.pages.find((p) => p.pageId === pageId);
      if (!page) {
        return;
      }
      Object.assign(page, patch);
      if (patch.slug !== undefined) {
        page.slug = this._uniqueSlug(this._slugify(patch.slug), pageId);
      } else if (patch.title) {
        page.slug = this._uniqueSlug(this._slugify(patch.title), pageId);
      }
    });
  }

  /**
   * Patch a page's SEO / social-sharing fields (metaTitle, metaDescription,
   * socialImageAssetId, socialImageUrl). Kept in a nested `seo` object so it
   * stays namespaced away from the nav/structure fields, and created lazily so
   * existing pages need no migration.
   */
  updatePageSeo(pageId, patch) {
    this._mutate((draft) => {
      const page = draft.pages.find((p) => p.pageId === pageId);
      if (!page) {
        return;
      }
      page.seo = { ...page.seo, ...patch };
    });
  }

  /** Make one page Home; exactly one page is Home at any time. */
  setHomePage(pageId) {
    this._mutate((draft) => {
      draft.pages.forEach((p) => {
        p.isHome = p.pageId === pageId;
      });
    });
  }

  /**
   * Reorder a page among its SIBLINGS (pages sharing its parentId): swap it
   * with the nearest sibling in the given direction. The page rail renders the
   * tree by grouping children under their parent regardless of array position,
   * so swapping the two siblings' array slots is enough — children stay put and
   * still render under whichever parent they point at.
   */
  movePage(pageId, direction) {
    this._mutate((draft) => {
      const pages = draft.pages;
      const i = pages.findIndex((p) => p.pageId === pageId);
      if (i === -1) {
        return;
      }
      const parentId = pages[i].parentId || null;
      let target = -1;
      for (let j = i + direction; j >= 0 && j < pages.length; j += direction) {
        if ((pages[j].parentId || null) === parentId) {
          target = j;
          break;
        }
      }
      if (target === -1) {
        return;
      }
      [pages[i], pages[target]] = [pages[target], pages[i]];
    });
  }

  // ---- navigation (custom links + menu prefs) --------------------------
  // The menu is derived from the pages (see c/navModel); config.nav only holds
  // the extras that aren't pages — custom/external links and the mobile menu
  // style. Created lazily so old configs need no migration.

  _nav(draft) {
    draft.nav = draft.nav || {};
    draft.nav.customLinks = draft.nav.customLinks || [];
    return draft.nav;
  }

  /** Add a custom menu link (external URL, tel:, mailto:, anchor). Returns its id. */
  addNavLink(label = "New link", url = "https://") {
    const link = { linkId: uuid(), label, url, newTab: false };
    this._mutate((draft) => {
      this._nav(draft).customLinks.push(link);
    });
    return link.linkId;
  }

  updateNavLink(linkId, patch) {
    this._mutate((draft) => {
      const link = this._nav(draft).customLinks.find(
        (l) => l.linkId === linkId
      );
      if (link) {
        Object.assign(link, patch);
      }
    });
  }

  removeNavLink(linkId) {
    this._mutate((draft) => {
      const nav = this._nav(draft);
      nav.customLinks = nav.customLinks.filter((l) => l.linkId !== linkId);
    });
  }

  /** Reorder a custom link within the custom-links list. */
  moveNavLink(linkId, direction) {
    this._mutate((draft) => {
      const links = this._nav(draft).customLinks;
      const i = links.findIndex((l) => l.linkId === linkId);
      const target = i + direction;
      if (i === -1 || target < 0 || target >= links.length) {
        return;
      }
      [links[i], links[target]] = [links[target], links[i]];
    });
  }

  /** Patch menu preferences (e.g. mobileMenuStyle: 'dropdown' | 'overlay'). */
  updateNavSettings(patch) {
    this._mutate((draft) => {
      Object.assign(this._nav(draft), patch);
    });
  }

  // ---- asset library folders -------------------------------------------
  // Folders organise the site's uploaded images. Like nav/presets they live in
  // the SiteConfig (config.library), so they ride save/load and undo for free
  // and need no new object or file-metadata writes. The images themselves stay
  // in Salesforce Files; only the folder NAMES and the assetId→folderId
  // assignments live here. Created lazily, so old configs need no migration.

  _library(draft) {
    draft.library = draft.library || {};
    draft.library.folders = draft.library.folders || [];
    draft.library.assignments = draft.library.assignments || {};
    draft.library.tags = draft.library.tags || {};
    draft.library.recent = draft.library.recent || [];
    return draft.library;
  }

  /** Every folder ({id, name}), the assetId→folderId assignment map, the
   *  assetId→tags map, and the most-recently-used asset id list. */
  assetLibrary() {
    const lib = this._config?.library || {};
    return {
      folders: (lib.folders || []).map((f) => ({ ...f })),
      assignments: { ...(lib.assignments || {}) },
      tags: { ...(lib.tags || {}) },
      recent: [...(lib.recent || [])]
    };
  }

  /** Create a folder. Returns its id. */
  addAssetFolder(name) {
    const folder = { id: uuid(), name: (name || "").trim() || "New folder" };
    this._mutate((draft) => {
      this._library(draft).folders.push(folder);
    });
    return folder.id;
  }

  renameAssetFolder(folderId, name) {
    this._mutate((draft) => {
      const folder = this._library(draft).folders.find(
        (f) => f.id === folderId
      );
      if (folder) {
        folder.name = (name || "").trim() || folder.name;
      }
    });
  }

  /** Delete a folder; any images in it fall back to Unfiled. */
  deleteAssetFolder(folderId) {
    this._mutate((draft) => {
      const lib = this._library(draft);
      lib.folders = lib.folders.filter((f) => f.id !== folderId);
      Object.keys(lib.assignments).forEach((assetId) => {
        if (lib.assignments[assetId] === folderId) {
          delete lib.assignments[assetId];
        }
      });
    });
  }

  /** Move an image into a folder (folderId) or out of all folders (null). */
  setAssetFolder(assetId, folderId) {
    if (!assetId) {
      return;
    }
    this._mutate((draft) => {
      const lib = this._library(draft);
      if (folderId) {
        lib.assignments[assetId] = folderId;
      } else {
        delete lib.assignments[assetId];
      }
    });
  }

  /** Replace an asset's tag list wholesale (empty array clears it). */
  setAssetTags(assetId, tags) {
    if (!assetId) {
      return;
    }
    const clean = [
      ...new Set((tags || []).map((t) => (t || "").trim()).filter(Boolean))
    ];
    this._mutate((draft) => {
      const lib = this._library(draft);
      if (clean.length) {
        lib.tags[assetId] = clean;
      } else {
        delete lib.tags[assetId];
      }
    });
  }

  /** Record that an asset was just picked/uploaded somewhere in the editor.
   *  Newest first, capped so the list stays a "recent" shortcut rather than
   *  growing into a second copy of every asset ever picked. */
  touchRecentAsset(assetId) {
    if (!assetId) {
      return;
    }
    this._mutate((draft) => {
      const lib = this._library(draft);
      lib.recent = [
        assetId,
        ...lib.recent.filter((id) => id !== assetId)
      ].slice(0, RECENT_ASSET_CAP);
    });
  }

  // ---- persistence -----------------------------------------------------

  /**
   * Persist the working config. Creates the record on first save, updates it
   * thereafter. Stamps version/savedAt into the config before writing so the
   * saved document is self-describing. Returns the record Id.
   */
  async save() {
    if (!this._config) {
      throw new Error("Nothing to save.");
    }
    const toSave = clone(this._config);
    toSave.history = {
      savedAt: new Date().toISOString(),
      version: (this._config.history?.version || 0) + 1
    };
    const name = toSave.meta?.businessName || "Untitled site";
    const json = JSON.stringify(toSave);

    if (this._recordId) {
      await saveSiteApex({ siteId: this._recordId, name, configJson: json });
    } else {
      // Attribute the new site to whoever's logged into their WebSuite
      // account, if anyone — createSiteForAccountApex accepts a null accountId
      // exactly like the plain createSiteApex path, so a logged-out visitor's
      // site is unaffected.
      const session = getStoredAccountSession();
      this._recordId = session?.accountId
        ? await createSiteForAccountApex({
            name,
            configJson: json,
            accountId: session.accountId
          })
        : await createSiteApex({ name, configJson: json });
      // The create call returns only an Id, but the server generated an
      // address for the new record — pick it up now so the hub can show it
      // without waiting for a reload. Never fatal: a site with an unknown
      // address is still fully reachable by Id.
      this._siteSlug = await getSiteSlugApex({
        siteId: this._recordId
      }).catch(() => null);
    }
    // Adopt the stamped config as the new clean baseline without losing
    // undo history: replace the current snapshot in place, clear dirty.
    this._config = toSave;
    this._history[this._index] = JSON.stringify(toSave);
    this._dirty = false;
    this._notify();
    return this._recordId;
  }

  /** Load a saved site by record Id and make it the clean baseline. */
  async load(recordId) {
    const view = await loadSiteApex({ siteId: recordId });
    const config = JSON.parse(view.config);
    this.initFromConfig(config, view.id, {
      isPublished: view.isPublished,
      publishedAt: view.publishedAt,
      reviewStatus: view.reviewStatus,
      submittedAt: view.submittedAt,
      siteSlug: view.slug
    });
    return config;
  }

  /**
   * Rename the site's public address. Returns the slug actually stored, which
   * is the normalised form of what was asked for — Apex owns that rule (see
   * WebsuiteSlug) and is the only thing that can answer whether an address is
   * free, so this deliberately doesn't pre-validate beyond having a record to
   * write to. Throws with a message meant to be shown when the address is
   * taken, reserved or empty.
   */
  async setSiteSlug(requested) {
    if (!this._recordId) {
      throw new Error("Save the site before naming its address.");
    }
    this._siteSlug = await setSiteSlugApex({
      siteId: this._recordId,
      requested
    });
    this._notify();
    return this._siteSlug;
  }

  // ---- publishing --------------------------------------------------------
  // Publishing copies the current (already-saved) draft into Published_Config__c
  // server-side and snapshots it for history. It never touches Config__c, so
  // it's deliberately NOT a _mutate call: no undo entry, no dirty flag, no
  // change to what's being edited.

  /** Publish the current saved draft. Throws if there's nothing saved yet. */
  async publish() {
    if (!this._recordId) {
      throw new Error("Save the site before publishing it.");
    }
    const result = await publishSiteApex({ siteId: this._recordId });
    this._isPublished = true;
    this._publishedAt = result.publishedAt;
    return this._publishedAt;
  }

  /**
   * Submit the current saved draft for manual staff review. Approval happens
   * elsewhere (the Command Center's "For Review" tab) — this only flags the
   * saved draft as pending server-side. It never touches Config__c, so it is
   * deliberately NOT a _mutate call: no undo entry, no dirty flag, no change
   * to what's being edited.
   */
  async submitForReview() {
    if (!this._recordId) {
      throw new Error("Save the site before submitting it for review.");
    }
    const result = await submitForReviewApex({ siteId: this._recordId });
    this._reviewStatus = "Pending Review";
    this._submittedAt = result.submittedAt;
    return this._submittedAt;
  }

  /** Publish history for the current site, newest first. */
  async getVersionHistory() {
    if (!this._recordId) {
      return [];
    }
    return getVersionHistoryApex({ siteId: this._recordId });
  }

  /**
   * Roll the DRAFT back to a past published snapshot (Published_Config__c and
   * publish status are untouched — this is a draft-side undo, not an instant
   * re-publish). Adopts the restored snapshot as the new clean baseline, same
   * as load(), so it rides the normal save/autosave path from here.
   */
  async restoreVersion(versionId) {
    if (!this._recordId) {
      throw new Error("No site to restore into.");
    }
    const json = await restoreVersionApex({
      siteId: this._recordId,
      versionId
    });
    const config = JSON.parse(json);
    this.initFromConfig(config, this._recordId, {
      isPublished: this._isPublished,
      publishedAt: this._publishedAt,
      reviewStatus: this._reviewStatus,
      submittedAt: this._submittedAt,
      siteSlug: this._siteSlug
    });
    return config;
  }
}

// Single shared instance — every component in the editor talks to this one store.
const store = new SiteStore();
export default store;