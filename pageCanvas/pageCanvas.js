/**
 * pageCanvas — renders the active page as a list of section slots, and owns the
 * canvas-level furniture: the element panel, the empty state, the rich-text
 * floating toolbar, and the responsive container the sections size themselves
 * against (see the CSS).
 *
 * It used to hold the per-type branch list and the edit frame too. Both moved to
 * sectionSlot once a row could contain other sections: the same switch is needed
 * at every depth, and a nested child deserves the same chrome as a top-level
 * one. Adding a section type = its LWC + registry entry + one branch in
 * sectionSlot.
 */
import { LightningElement, api } from 'lwc';
import store, { sectionsInSameList, findSectionInPage } from 'c/siteStateService';
import { defaultElement, sanitizeInlineHtml, isSafeHref } from 'c/sectionRegistry';

export default class PageCanvas extends LightningElement {
    @api page;
    @api mode = 'edit';
    @api selectedSectionIds;
    @api globals;
    // The derived site menu, threaded down to the nav-header section so it
    // renders real navigation. Only sectionNavHeader reads it.
    @api navMenu;

    // Threaded down to sectionBlogList (dynamic CMS content queries by site,
    // not by anything in SiteConfig). Blank until the site has been saved once.
    @api siteId;

    elementPanelOpen = false;

    // Rich-text floating toolbar: shown whenever a [contenteditable="true"]
    // field anywhere in the canvas has focus. focusin/focusout are composed,
    // so they bubble up through child section components' shadow roots.
    richToolbarVisible = false;
    richToolbarTop = 0;
    richToolbarLeft = 0;

    // ---- drag state --------------------------------------------------------
    // The canvas coordinates every drag: slots announce the grab and claim drop
    // targets via composed events; this component owns the live ids (threaded
    // back down as a prop), the floating label chip, and the commit on release.
    // Grabbing a section that is part of the current multi-selection drags the
    // WHOLE selection; the ids array is that group (usually just one).
    draggingSectionIds = [];
    dragLabel = '';
    dragChipX = 0;
    dragChipY = 0;
    _pendingDrag = null; // grip pressed but the 5px threshold not yet crossed
    _dropTarget = null; // last target claimed by a slot/column, or null

    constructor() {
        super();
        this._onWinMove = this.onWinMove.bind(this);
        this._onWinUp = this.onWinUp.bind(this);
        this._onKeyDown = this.onKeyDown.bind(this);
        this._onGlobalKeyDown = this.onGlobalKeyDown.bind(this);
    }

    connectedCallback() {
        // Separate from _onKeyDown (drag-Escape, only attached during a drag)
        // — this one is permanent, for arrow-reorder/Delete on whatever
        // section is selected. Kept as its own listener rather than folded
        // into _onKeyDown so the proven drag-cancel path stays untouched.
        window.addEventListener('keydown', this._onGlobalKeyDown);
    }

    disconnectedCallback() {
        this._teardownDrag();
        window.removeEventListener('keydown', this._onGlobalKeyDown);
    }

    get isEdit() {
        return this.mode === 'edit';
    }

    get isLive() {
        return this.mode !== 'edit';
    }

    // Gates c-site-cart's mount: only meaningful outside edit mode (see
    // siteCart's header comment), and only worth mounting on a page that
    // actually sells something — c-site-cart itself also stays visible if
    // the visitor already has items from another page on this site.
    get hasShopSection() {
        return !!(this.page && this.page.sections && this.page.sections.some((s) => s.type === 'shop'));
    }

    get hasSections() {
        return !!(this.page && this.page.sections && this.page.sections.length);
    }

    get showEmptyState() {
        return this.isEdit && !this.hasSections;
    }

    get pageId() {
        return this.page && this.page.pageId;
    }

    get sections() {
        const list = (this.page && this.page.sections) || [];
        // Hidden sections stay visible (dimmed, via sectionSlot's own chrome)
        // in edit mode so they can be found and un-hidden; Preview drops them
        // entirely, since drag/reorder — the only thing index/isFirst/isLast
        // feed — is edit-mode only.
        const visible = this.isEdit ? list : list.filter((s) => !(s.flags && s.flags.hidden));
        return visible.map((section, index) => ({
            key: section.sectionId,
            node: section,
            index,
            isFirst: index === 0,
            isLast: index === visible.length - 1
        }));
    }

    get dragging() {
        return this.draggingSectionIds.length > 0;
    }

    get canvasClass() {
        return this.dragging ? 'canvas canvas_dragging' : 'canvas';
    }

    get dragChipStyle() {
        return `left:${this.dragChipX}px;top:${this.dragChipY}px;`;
    }

    // ---- multi-select action bar --------------------------------------------
    get multiIds() {
        return this.selectedSectionIds || [];
    }

    get multiCount() {
        return this.multiIds.length;
    }

    get showMultiBar() {
        return this.isEdit && this.multiCount > 1 && !this.dragging;
    }

    // Grouping wraps ONE list's members in a row; a selection that straddles
    // lists (top level + inside a column) has no sensible group shape.
    get cannotGroup() {
        return !sectionsInSameList(this.page, this.multiIds);
    }

    handleMultiAlign(event) {
        store.alignSections(this.pageId, this.multiIds, event.currentTarget.dataset.align);
    }

    handleMultiDistribute() {
        store.distributeSections(this.pageId, this.multiIds);
    }

    handleMultiGroup() {
        const rowId = store.groupSections(this.pageId, this.multiIds);
        if (rowId) {
            // Select the new row (single) so the settings panel lands on it.
            this.dispatchEvent(
                new CustomEvent('sectionselect', { detail: { sectionId: rowId }, bubbles: true, composed: true })
            );
        }
    }

    handleMultiDuplicate() {
        store.duplicateSections(this.pageId, this.multiIds);
    }

    handleMultiDelete() {
        // eslint-disable-next-line no-alert
        if (window.confirm(`Delete ${this.multiCount} sections? This cannot be undone except via Undo.`)) {
            store.deleteSections(this.pageId, this.multiIds);
        }
    }

    handleMultiClear() {
        this.dispatchEvent(
            new CustomEvent('sectionselect', { detail: { sectionId: null }, bubbles: true, composed: true })
        );
    }

    // ---- drag coordination -------------------------------------------------
    handleDragStart(event) {
        if (!this.isEdit) {
            return;
        }
        // Don't enter drag mode yet: a plain click on the grip shouldn't
        // flicker the whole canvas into drag chrome. Arm it, and let the first
        // real movement past the threshold activate.
        this._pendingDrag = event.detail;
        // Capture phase on purpose, twice over: slots stopPropagation the
        // bubbling pointermove to claim targets, and window-capture runs before
        // any of that; likewise pointerup must fire even when released over
        // empty page background outside the canvas.
        window.addEventListener('pointermove', this._onWinMove, true);
        window.addEventListener('pointerup', this._onWinUp, true);
        window.addEventListener('keydown', this._onKeyDown, true);
    }

    handleDragOver(event) {
        this._dropTarget = event.detail.target;
    }

    onWinMove(event) {
        if (this._pendingDrag && !this.dragging) {
            const dx = event.clientX - this._pendingDrag.x;
            const dy = event.clientY - this._pendingDrag.y;
            if (Math.hypot(dx, dy) < 5) {
                return;
            }
            // Grabbing a member of the multi-selection drags the whole group;
            // grabbing anything else drags just that section.
            const grabbed = this._pendingDrag.sectionId;
            const group = this.multiIds.length > 1 && this.multiIds.includes(grabbed);
            this.draggingSectionIds = group ? [...this.multiIds] : [grabbed];
            this.dragLabel = group ? `${this.multiIds.length} sections` : this._pendingDrag.label;
        }
        if (!this.dragging) {
            return;
        }
        const canvas = this.template.querySelector('.canvas');
        if (canvas) {
            const rect = canvas.getBoundingClientRect();
            this.dragChipX = event.clientX - rect.left + 14;
            this.dragChipY = event.clientY - rect.top + 14;
        }
    }

    onWinUp() {
        const sectionIds = this.draggingSectionIds;
        const target = this._dropTarget;
        this._teardownDrag();
        if (sectionIds.length && target) {
            store.relocateSections(this.page.pageId, sectionIds, target);
        }
    }

    onKeyDown(event) {
        if (event.key === 'Escape') {
            this._teardownDrag();
        }
    }

    /**
     * Keyboard reorder (ArrowUp/Down, single selection only — no bulk
     * reorder-by-slot primitive exists to reuse for multi-select) and delete
     * (any selection size, mirrors handleMultiDelete's confirm + bulk call)
     * for whichever section(s) are currently selected. Guards out
     * contenteditable/interactive targets so typing in a field is never
     * intercepted, same idiom as handleCanvasFocusIn/handleCanvasPaste below.
     */
    onGlobalKeyDown(event) {
        if (!this.isEdit || this.dragging) {
            return;
        }
        const el = event.composedPath()[0];
        if (el && (el.isContentEditable || (el.closest && el.closest('button, input, select, textarea, a, c-image-uploader')))) {
            return;
        }
        const ids = this.selectedSectionIds || [];
        if (!ids.length) {
            return;
        }
        if (event.key === 'Delete' || event.key === 'Backspace') {
            event.preventDefault();
            const message =
                ids.length > 1
                    ? `Delete ${ids.length} sections? This cannot be undone except via Undo.`
                    : 'Delete this section? This cannot be undone except via Undo.';
            // eslint-disable-next-line no-alert
            if (window.confirm(message)) {
                store.deleteSections(this.pageId, ids);
            }
            return;
        }
        if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && ids.length === 1) {
            event.preventDefault();
            store.moveSection(this.pageId, ids[0], event.key === 'ArrowUp' ? -1 : 1);
        }
    }

    _teardownDrag() {
        window.removeEventListener('pointermove', this._onWinMove, true);
        window.removeEventListener('pointerup', this._onWinUp, true);
        window.removeEventListener('keydown', this._onKeyDown, true);
        this._pendingDrag = null;
        this._dropTarget = null;
        this.draggingSectionIds = [];
        this.dragLabel = '';
    }

    // ---- Element Panel (Layout/Text/Image/Button/Spacer) -----------------
    toggleElementPanel() {
        this.elementPanelOpen = !this.elementPanelOpen;
    }

    // A pick joins the currently-selected freeform canvas (cascaded slightly so
    // it doesn't land exactly on the last element); with no single freeform
    // section selected, it falls back to the old behavior — a fresh section,
    // the same way "+ Add section" always appends a whole new section.
    handleElementPick(event) {
        const { kind } = event.detail;
        const targetId = (this.selectedSectionIds || []).length === 1 ? this.selectedSectionIds[0] : null;
        const target = targetId ? findSectionInPage(this.page, targetId) : null;
        if (target && target.type === 'freeform') {
            const existing = target.content?.elements || [];
            const cascade = Math.min(50 + (existing.length % 5) * 6, 100);
            const el = { ...defaultElement(kind), x: cascade, y: cascade };
            store.updateSectionContent(this.page.pageId, targetId, { elements: [...existing, el] });
            this.elementPanelOpen = false;
            this.dispatchEvent(
                new CustomEvent('sectionselect', { detail: { sectionId: targetId }, bubbles: true, composed: true })
            );
            return;
        }
        const sectionId = store.addSection(this.page.pageId, 'freeform');
        store.updateSectionContent(this.page.pageId, sectionId, { elements: [defaultElement(kind)] });
        this.elementPanelOpen = false;
        this.dispatchEvent(
            new CustomEvent('sectionselect', { detail: { sectionId }, bubbles: true, composed: true })
        );
    }

    // ---- rich-text floating toolbar ---------------------------------------
    handleCanvasFocusIn(event) {
        const el = event.composedPath()[0];
        if (!el || !el.getAttribute || el.getAttribute('contenteditable') !== 'true') {
            return;
        }
        const rect = el.getBoundingClientRect();
        this.richToolbarTop = Math.max(rect.top - 44, 8);
        this.richToolbarLeft = rect.left;
        this.richToolbarVisible = true;
    }

    handleCanvasFocusOut() {
        // Toolbar buttons preventDefault on mousedown, so a real blur here
        // only ever means focus left the field for something other than the
        // toolbar — safe to hide immediately.
        this.richToolbarVisible = false;
    }

    handleFormat(event) {
        const { command, value } = event.detail;
        if (command === 'createLink') {
            // window.prompt doesn't blur the field (window focus ≠ element
            // focus), so the text selection survives and createLink applies
            // to it when we return.
            // eslint-disable-next-line no-alert
            const url = window.prompt('Link URL (https://…, mailto:…, tel:… or /page):', 'https://');
            if (!url || !isSafeHref(url)) {
                return; // unsafe schemes would be stripped on save anyway
            }
            document.execCommand('createLink', false, url.trim());
            return;
        }
        if (command === 'formatBlock') {
            // Heading / normal-text toggle. h1–h3 survive the sanitizer; 'p'
            // unwraps back to plain text, which is exactly "normal".
            document.execCommand('formatBlock', false, value);
            return;
        }
        document.execCommand(command, false, null);
    }

    // Paste lands as sanitized markup, never raw clipboard HTML: Word/Docs
    // spans, styles and classes die here instead of living in the DOM until
    // the field's blur-commit cleans them (or worse, being committed by a
    // plain-text field that only reads textContent).
    handleCanvasPaste(event) {
        const el = event.composedPath()[0];
        if (!el || !el.getAttribute || el.getAttribute('contenteditable') !== 'true') {
            return;
        }
        event.preventDefault();
        const html = event.clipboardData && event.clipboardData.getData('text/html');
        const text = event.clipboardData && event.clipboardData.getData('text/plain');
        if (html) {
            document.execCommand('insertHTML', false, sanitizeInlineHtml(html));
        } else if (text) {
            document.execCommand('insertText', false, text);
        }
    }
}