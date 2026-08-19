/**
 * sectionLibrary — the "Add section" picker (brief §4.2), in three groups:
 *   Sections     — single section types from the registry
 *   Layouts      — prebuilt row compositions (columns already seeded)
 *   Your presets — sections the user saved from the canvas (☆ on the frame),
 *                  stored in this site's config and re-inserted with fresh ids
 * Picking anything adds it to the active page via the store and reports the new
 * section's id so the shell can select it. Rendered as a modal.
 */
import { LightningElement, api } from "lwc";
import store from "c/siteStateService";
import {
  libraryTypes,
  prebuiltLayouts,
  buildPrebuilt,
  typeLabel
} from "c/sectionRegistry";
import { blockFromSection } from "c/blockModel";

export default class SectionLibrary extends LightningElement {
  @api pageId;

  presets = [];
  globalBlocks = [];

  connectedCallback() {
    this.refreshPresets();
    this.refreshGlobals();
  }

  refreshPresets() {
    const state = store.getState();
    this.presets = (state?.presets || []).map((p) => ({
      presetId: p.presetId,
      name: p.name,
      typeLabel: typeLabel(p.type),
      thumb: "☆"
    }));
  }

  refreshGlobals() {
    this.globalBlocks = store.globalsList().map((g) => ({
      globalId: g.globalId,
      name: g.heading || typeLabel(g.type),
      typeLabel: typeLabel(g.type),
      thumb: "🌐"
    }));
  }

  get types() {
    return libraryTypes();
  }

  get layouts() {
    return prebuiltLayouts();
  }

  get hasPresets() {
    return this.presets.length > 0;
  }

  get hasGlobals() {
    return this.globalBlocks.length > 0;
  }

  _added(sectionId) {
    this.dispatchEvent(new CustomEvent("added", { detail: { sectionId } }));
  }

  /** A picked block lands on the canvas, stacked below whatever is already there. */
  _addedBlock(blockId) {
    this.dispatchEvent(new CustomEvent("blockadded", { detail: { blockId } }));
  }

  /**
   * Picking a section now creates a canvas BLOCK, not a stacked section. It
   * drops below the lowest existing block so a fresh pick is never hidden
   * underneath something already on the canvas.
   */
  handlePick(event) {
    const { type } = event.currentTarget.dataset;
    const category = store.getState()?.meta?.category || "default";
    const block = blockFromSection(type, category);
    block.frame.desktop.y = this._nextDropY();
    this._addedBlock(store.addBlock(this.pageId, block));
  }

  /** The y just below every existing block, so drops never overlap by default. */
  _nextDropY() {
    const page = (store.getState()?.pages || []).find(
      (p) => p.pageId === this.pageId
    );
    const blocks = (page && page.blocks) || [];
    return blocks.reduce((lowest, b) => {
      const f = (b.frame && b.frame.desktop) || { y: 0, h: 0 };
      return Math.max(lowest, (f.y || 0) + (f.h || 0));
    }, 0);
  }

  handlePickLayout(event) {
    const { layoutId } = event.currentTarget.dataset;
    const category = store.getState()?.meta?.category || "default";
    const node = buildPrebuilt(layoutId, category);
    if (node) {
      this._added(store.addSectionNode(this.pageId, node));
    }
  }

  handlePickGlobal(event) {
    const { globalId } = event.currentTarget.dataset;
    const sectionId = store.addGlobalInstance(this.pageId, globalId);
    if (sectionId) {
      this._added(sectionId);
    }
  }

  handlePickPreset(event) {
    const { presetId } = event.currentTarget.dataset;
    const sectionId = store.addSectionFromPreset(this.pageId, presetId);
    if (sectionId) {
      this._added(sectionId);
    }
  }

  handleDeletePreset(event) {
    event.stopPropagation();
    const { presetId } = event.currentTarget.dataset;
    /* eslint-disable-next-line no-alert -- confirmation before a destructive delete */
    const confirmed = window.confirm(
      "Delete this preset? Sections already on pages are not affected."
    );
    if (confirmed) {
      store.deleteSectionPreset(presetId);
      this.refreshPresets();
    }
  }

  close() {
    this.dispatchEvent(new CustomEvent("close"));
  }

  // Close on backdrop click, but not when clicking inside the dialog.
  handleBackdrop() {
    this.close();
  }

  stop(event) {
    event.stopPropagation();
  }
}