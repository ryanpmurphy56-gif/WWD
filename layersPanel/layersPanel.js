/**
 * layersPanel — a flat, indented view of the active page's section tree.
 * `flattenPageSections` (siteStateService) is the one source of truth for the
 * depth-first walk, so this never re-implements tree traversal itself.
 *
 * Selection reuses the exact `sectionselect` {sectionId, additive} event
 * contract sectionSlot already emits, so it reaches siteEditorShell's existing
 * handleSectionSelect with zero changes to selection logic. Reorder and
 * lock/hide call the same store mutators the canvas frame's own buttons use
 * (moveSection, setSectionFlags).
 */
import { LightningElement, api } from 'lwc';
import store, { flattenPageSections } from 'c/siteStateService';
import { typeLabel } from 'c/sectionRegistry';

export default class LayersPanel extends LightningElement {
    @api activePage;
    @api selectedSectionIds;
    @api globals;

    get pageId() {
        return this.activePage && this.activePage.pageId;
    }

    get flatRows() {
        return flattenPageSections(this.activePage);
    }

    get rows() {
        return this.flatRows.map((r) => this._row(r));
    }

    get isEmpty() {
        return this.rows.length === 0;
    }

    _row(r) {
        const node = r.node;
        const isRef = node.type === 'globalRef';
        const resolvedType = isRef ? ((this.globals || {})[node.globalId] || {}).type : node.type;
        const locked = !!(node.flags && node.flags.locked);
        const hidden = !!(node.flags && node.flags.hidden);
        const selected = (this.selectedSectionIds || []).includes(r.sectionId);
        return {
            sectionId: r.sectionId,
            isFirst: r.isFirst,
            isLast: r.isLast,
            label: isRef ? `${typeLabel(resolvedType)} • global` : typeLabel(resolvedType),
            indentStyle: `padding-left:${0.5 + r.depth * 1.1}rem`,
            rowClass: selected ? 'row row_active' : 'row',
            lockClass: locked ? 'flag flag_on' : 'flag',
            lockTitle: locked ? 'Unlock' : 'Lock',
            hideClass: hidden ? 'flag flag_on' : 'flag',
            hideTitle: hidden ? 'Unhide' : 'Hide'
        };
    }

    _findNode(sectionId) {
        const found = this.flatRows.find((r) => r.sectionId === sectionId);
        return found ? found.node : null;
    }

    // ---- selection (owned by the shell) -----------------------------------
    handleSelect(event) {
        const { sectionId } = event.currentTarget.dataset;
        this.dispatchEvent(
            new CustomEvent('sectionselect', {
                detail: {
                    sectionId,
                    additive: event.ctrlKey || event.metaKey || event.shiftKey
                },
                bubbles: true,
                composed: true
            })
        );
    }

    // ---- structural changes (straight to the store) -----------------------
    handleMoveUp(event) {
        store.moveSection(this.pageId, event.currentTarget.dataset.sectionId, -1);
    }

    handleMoveDown(event) {
        store.moveSection(this.pageId, event.currentTarget.dataset.sectionId, 1);
    }

    handleToggleLocked(event) {
        event.stopPropagation();
        const { sectionId } = event.currentTarget.dataset;
        const node = this._findNode(sectionId);
        const locked = !!(node && node.flags && node.flags.locked);
        store.setSectionFlags(this.pageId, sectionId, { locked: !locked });
    }

    handleToggleHidden(event) {
        event.stopPropagation();
        const { sectionId } = event.currentTarget.dataset;
        const node = this._findNode(sectionId);
        const hidden = !!(node && node.flags && node.flags.hidden);
        store.setSectionFlags(this.pageId, sectionId, { hidden: !hidden });
    }
}