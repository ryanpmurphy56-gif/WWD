/**
 * pageRail — the page list (brief §4.2). Select the active page, add (from a
 * template), duplicate, delete, rename, reorder, and toggle the Home and nav
 * flags. Pages render as a one-level tree: child pages (page.parentId) indent
 * beneath their parent. Selection is editor UI state, so it is emitted up to the
 * shell; every structural change goes straight through the shared store.
 */
import { LightningElement, api, track } from 'lwc';
import store from 'c/siteStateService';
import { libraryTypes } from 'c/sectionRegistry';

export default class PageRail extends LightningElement {
    @api pages = [];
    @api activePageId;

    @track editingPageId;
    pickerOpen = false;
    _focusPending = false;

    // Both rail groups collapse so neither crowds the other — the Sections
    // quick-add grid is tall, so folding it hands the whole rail to the pages.
    pagesOpen = true;
    sectionsOpen = true;

    togglePages() {
        this.pagesOpen = !this.pagesOpen;
    }

    toggleSections() {
        this.sectionsOpen = !this.sectionsOpen;
    }

    get pagesChevron() {
        return this.pagesOpen ? '▾' : '▸';
    }

    get sectionsChevron() {
        return this.sectionsOpen ? '▾' : '▸';
    }

    get sectionTypes() {
        return libraryTypes();
    }

    // Quick-add: drop a category-seeded section straight onto the active page
    // and select it, same as picking one from the "+ Add section" modal.
    handleSectionPick(event) {
        if (!this.activePageId) {
            return;
        }
        const { type } = event.currentTarget.dataset;
        const sectionId = store.addSection(this.activePageId, type);
        this.dispatchEvent(
            new CustomEvent('sectionadded', { detail: { sectionId }, bubbles: true, composed: true })
        );
    }

    /**
     * Flatten the pages into display rows in tree order: each top-level page,
     * immediately followed by its children. isFirst/isLast are computed per
     * sibling group so the up/down arrows only reorder within a group.
     */
    get rows() {
        const pages = this.pages || [];
        const tops = pages.filter((p) => !p.parentId);
        const out = [];
        tops.forEach((top, ti) => {
            out.push(this._row(top, false, ti === 0, ti === tops.length - 1));
            const kids = pages.filter((c) => c.parentId === top.pageId);
            kids.forEach((kid, ki) => {
                out.push(this._row(kid, true, ki === 0, ki === kids.length - 1));
            });
        });
        return out;
    }

    _row(p, isChild, isFirst, isLast) {
        const active = p.pageId === this.activePageId;
        return {
            pageId: p.pageId,
            title: p.title,
            isHome: p.isHome,
            editing: p.pageId === this.editingPageId,
            isFirst,
            isLast,
            rowClass: `row${active ? ' row_active' : ''}${isChild ? ' row_child' : ''}`,
            homeClass: p.isHome ? 'flag flag_on' : 'flag',
            navClass: p.inNav ? 'flag flag_on' : 'flag',
            navTitle: p.inNav ? 'Shown in nav — click to hide' : 'Hidden from nav — click to show'
        };
    }

    get onlyOnePage() {
        return (this.pages || []).length <= 1;
    }

    renderedCallback() {
        if (this._focusPending) {
            this._focusPending = false;
            const input = this.template.querySelector('.row__input');
            if (input) {
                input.focus();
                input.select();
            }
        }
    }

    // ---- selection (owned by the shell) ---------------------------------
    handleSelect(event) {
        this.emitSelect(event.currentTarget.dataset.pageId);
    }

    emitSelect(pageId) {
        this.dispatchEvent(new CustomEvent('selectpage', { detail: { pageId } }));
    }

    // ---- add from a template --------------------------------------------
    handleAdd() {
        this.pickerOpen = true;
    }

    handlePickerClose() {
        this.pickerOpen = false;
    }

    handlePickTemplate(event) {
        const { templateId, title } = event.detail;
        const newId = store.addPageFromTemplate(templateId, title);
        this.pickerOpen = false;
        this.editingPageId = newId; // drop straight into rename
        this._focusPending = true;
        this.emitSelect(newId);
    }

    // ---- other structural changes (straight to the store) ---------------
    handleDuplicate(event) {
        const newId = store.duplicatePage(event.currentTarget.dataset.pageId);
        if (newId) {
            this.emitSelect(newId);
        }
    }

    handleDelete(event) {
        const { pageId } = event.currentTarget.dataset;
        // eslint-disable-next-line no-alert
        if (window.confirm('Delete this page and its sections?')) {
            store.deletePage(pageId);
        }
    }

    handleMoveUp(event) {
        store.movePage(event.currentTarget.dataset.pageId, -1);
    }

    handleMoveDown(event) {
        store.movePage(event.currentTarget.dataset.pageId, 1);
    }

    handleSetHome(event) {
        store.setHomePage(event.currentTarget.dataset.pageId);
    }

    handleToggleNav(event) {
        const { pageId } = event.currentTarget.dataset;
        const page = (this.pages || []).find((p) => p.pageId === pageId);
        if (page) {
            store.updatePage(pageId, { inNav: !page.inNav });
        }
    }

    // ---- rename ----------------------------------------------------------
    handleRenameStart(event) {
        this.editingPageId = event.currentTarget.dataset.pageId;
        this._focusPending = true;
    }

    handleRenameCommit(event) {
        const { pageId } = event.currentTarget.dataset;
        const value = (event.target.value || '').trim();
        if (value) {
            store.updatePage(pageId, { title: value });
        }
        this.editingPageId = undefined;
    }

    handleRenameKey(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            event.target.blur();
        } else if (event.key === 'Escape') {
            this.editingPageId = undefined;
        }
    }
}