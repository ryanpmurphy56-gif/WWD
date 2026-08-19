/**
 * siteEditorShell — top-level editor layout and the only component that owns
 * editor UI state (mode, device, active page, selection, which overlay is open).
 * All *site* state lives in the shared store; the shell subscribes to it, never
 * copies it.
 *
 * It composes the M2 chrome — editorToolbar, pageRail, pageCanvas, settingsPanel,
 * sectionLibrary and humanRequestModal — and routes their events to the store.
 * The theme/settings panel and page management all read the same store the
 * canvas renders from, so every edit is reflected live everywhere at once.
 */
import { LightningElement, api, track } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import store, { findSectionInPage } from 'c/siteStateService';
import { buildNav } from 'c/navModel';

const AUTOSAVE_DELAY = 2000;
const STATUS_CLEAR_DELAY = 2000;

// One is picked at random per visit while a saved site loads — a small moment
// of personality instead of a flat "Loading…".
const LOADING_MESSAGES = [
    'Unboxing your website…',
    'Rolling out the welcome mat…',
    'Waking up your pages…',
    'Dusting off the pixels…',
    'Un-crumpling the blueprints…',
    'Pouring coffee for the editor…'
];

// Written by websuiteWizard.openEditor() just before it navigates here — a
// full page navigation is a fresh JS context, so the in-memory store can't
// carry the draft directly. This is the only "determine the site" flow now;
// the editor's own onboarding wizard was removed.
const PENDING_DRAFT_KEY = 'websuitePendingSiteDraft';

export default class SiteEditorShell extends NavigationMixin(LightningElement) {
    // Optional: an existing Website_Site__c Id to open. Blank = seed a new demo.
    @api recordId;

    // Declared to satisfy the Experience Builder property panel's existing
    // targetConfig (js-meta.xml) — not yet read anywhere. Pre-existing gap
    // found while deploying: the org's live config already promised this
    // property to admins; it just had no backing class member.
    @api hideThemeControls = false;

    @track config;
    // 'hub' | 'editor' — the persistent home dashboard vs. the full editor.
    // Defaults to 'hub' for every resolved site (draft, blank, or loaded
    // record); only the pre-existing `starting` fallback bypasses it.
    view = 'hub';
    mode = 'edit';
    device = 'desktop';
    // Visual scale of the canvas frame — independent of `device`, which caps
    // layout width for responsive preview. 100 = no transform at all.
    zoom = 100;
    activePageId;
    // Primary selection (drives the settings panel) plus the full multi-select
    // set. Invariant: selectedSectionId is always a member of selectedSectionIds
    // (or both are empty) — the canvas only ever renders from the array.
    selectedSectionId;
    selectedSectionIds = [];

    dirty = false;
    canUndo = false;
    canRedo = false;
    saving = false;
    publishing = false;
    statusText = '';
    clipboard = null;

    libraryOpen = false;
    helpOpen = false;
    helpSource = 'editor';
    themePopupOpen = false;
    rightTab = 'settings';
    fullscreen = false;
    loadingMessage = LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)];

    _unsubscribe;
    _autosaveTimer;
    _statusTimer;

    connectedCallback() {
        this._unsubscribe = store.subscribe((config) => this.onStateChange(config));
        if (this.consumePendingDraft()) {
            return;
        }
        if (this.recordId) {
            store.load(this.recordId).catch((e) => this.reportError('Could not load site', e));
        }
        // No record and no pending draft -> the "no site yet" fallback shows (see `starting`).
    }

    // Picks up a draft the marketing-site wizard built and stashed just before
    // navigating here. Returns true if one was found and adopted.
    consumePendingDraft() {
        const json = window.sessionStorage.getItem(PENDING_DRAFT_KEY);
        if (!json) {
            return false;
        }
        window.sessionStorage.removeItem(PENDING_DRAFT_KEY);
        try {
            store.startFromDraft(JSON.parse(json));
            return true;
        } catch (e) {
            this.reportError('Could not read the site draft', e);
            return false;
        }
    }

    disconnectedCallback() {
        if (this._unsubscribe) {
            this._unsubscribe();
        }
        window.clearTimeout(this._autosaveTimer);
        window.clearTimeout(this._statusTimer);
    }

    onStateChange(config) {
        this.config = config;
        this.dirty = store.isDirty();
        this.canUndo = store.canUndo();
        this.canRedo = store.canRedo();
        this.clipboard = store.getClipboard();

        const pages = config?.pages || [];
        if (!pages.some((p) => p.pageId === this.activePageId)) {
            const home = pages.find((p) => p.isHome) || pages[0];
            this.activePageId = home ? home.pageId : undefined;
        }
        // Drop selections that no longer exist (deleted sections / page change).
        if (this.selectedSectionIds.length) {
            const kept = this.selectedSectionIds.filter((id) => findSectionInPage(this.activePage, id));
            if (kept.length !== this.selectedSectionIds.length) {
                this.selectedSectionIds = kept;
            }
        }
        if (this.selectedSectionId && !this.selectedSection) {
            this.selectedSectionId = this.selectedSectionIds[this.selectedSectionIds.length - 1];
        }
        this.scheduleAutosave();
    }

    // ---- derived view state ---------------------------------------------
    get pages() {
        return this.config?.pages || [];
    }

    get activePage() {
        return this.pages.find((p) => p.pageId === this.activePageId) || null;
    }

    get globals() {
        return this.config?.globals || {};
    }

    // The menu, derived from the pages + custom links, threaded to the nav header
    // section so it renders the real site navigation (not a hardcoded list).
    get navMenu() {
        return buildNav(this.config);
    }

    get navConfig() {
        return this.config?.nav || {};
    }

    get redirectsConfig() {
        return this.config?.redirects || [];
    }

    get selectedSection() {
        // Walks nested rows, not just page.sections — a child inside a column is
        // selectable, and a flat find would report it missing, which the
        // stale-selection check above would then read as "deleted".
        const node = findSectionInPage(this.activePage, this.selectedSectionId);
        if (node && node.type === 'globalRef') {
            // The settings panel edits the shared definition (the store
            // redirects writes there anyway), but keeps the instance id so its
            // store calls still resolve through the page.
            const source = this.globals[node.globalId];
            // flags (locked/hidden) are per-instance, not part of the shared
            // definition — thread the instance's own flags through even though
            // everything else here resolves from `source`.
            return source ? { ...source, sectionId: node.sectionId, flags: node.flags } : null;
        }
        return node;
    }

    get siteName() {
        return this.config?.meta?.businessName || 'Untitled site';
    }

    get isEdit() {
        return this.mode === 'edit';
    }

    // Publish/review state lives on the store as plain fields (not inside
    // config — see siteStateService's _isPublished/_reviewStatus doc comment),
    // so these read the store directly rather than the config snapshot. They
    // re-evaluate whenever this component re-renders, which submitForReview
    // and restoreVersion already trigger via the this.publishing/onStateChange
    // field writes around them.
    get isPublished() {
        return store.isPublished();
    }

    get publishedAt() {
        return store.getPublishedAt();
    }

    get reviewStatus() {
        return store.getReviewStatus();
    }

    get submittedAt() {
        return store.getSubmittedAt();
    }

    // Same "read the store directly" precedent as isPublished/publishedAt
    // above — the @api recordId prop only reflects the URL param at initial
    // load, but a wizard draft gets a real record id the moment it's first
    // saved, and the hub's Contacts card needs that live value, not the stale one.
    get liveRecordId() {
        return store.getRecordId();
    }

    // No site loaded and none being loaded -> show the "no site yet" fallback.
    get starting() {
        return !this.recordId && !this.config;
    }

    get isHubView() {
        return !this.starting && this.view === 'hub';
    }

    get isEditorView() {
        return !this.starting && this.view === 'editor';
    }

    get showPolishCta() {
        return !this.isEdit && !!this.activePage;
    }

    get frameClass() {
        return `frame frame_${this.device}`;
    }

    // No transform at all at 100% zoom — see the comment on `.frame` in
    // siteEditorShell.css for why that matters (a stray transform, even an
    // identity scale(1), would contain every position:fixed descendant and
    // let .frame's overflow:hidden clip them).
    get frameStyle() {
        return this.zoom === 100 ? '' : `transform: scale(${this.zoom / 100}); transform-origin: top center;`;
    }

    get theme() {
        return this.config?.theme || {};
    }

    // Right panel tabs: section/page settings vs. layers/history. Design
    // (theme) settings live in a cog-triggered popup, not a rail tab.
    get isSettingsTab() {
        return this.rightTab === 'settings';
    }
    get isLayersTab() {
        return this.rightTab === 'layers';
    }
    get isHistoryTab() {
        return this.rightTab === 'history';
    }
    get settingsTabClass() {
        return this.isSettingsTab ? 'ptab ptab_on' : 'ptab';
    }
    get layersTabClass() {
        return this.isLayersTab ? 'ptab ptab_on' : 'ptab';
    }
    get historyTabClass() {
        return this.isHistoryTab ? 'ptab ptab_on' : 'ptab';
    }

    // ---- hub <-> editor ----------------------------------------------------
    handleGoToHub() {
        this.view = 'hub';
    }

    handleGoToEditor(event) {
        const pageId = event?.detail?.pageId;
        if (pageId && this.pages.some((p) => p.pageId === pageId)) {
            this.activePageId = pageId;
        }
        this.view = 'editor';
    }

    handleGoToStyles() {
        this.view = 'editor';
        this.themePopupOpen = true;
    }

    // ---- toolbar events --------------------------------------------------
    handleModeToggle() {
        this.mode = this.isEdit ? 'preview' : 'edit';
        if (!this.isEdit) {
            this.clearSelection(); // no selection chrome in preview
        }
    }

    handleDeviceChange(event) {
        this.device = event.detail.device;
    }

    handleZoomChange(event) {
        this.zoom = event.detail.zoom;
    }

    handleUndo() {
        store.undo();
    }

    handleRedo() {
        store.redo();
    }

    async handleSave() {
        await this.doSave('Saved');
    }

    // Submit for review is a separate action from Save: it flags the current
    // saved draft as pending in the Command Center's "For Review" tab. It
    // does NOT publish — a staff member approves it live from there
    // (WebsiteReviewController.approveSite).
    async handleSubmitForReview() {
        if (this.publishing) {
            return;
        }
        this.publishing = true;
        try {
            await store.submitForReview();
            this.flashStatus('Submitted for review');
        } catch (e) {
            this.reportError('Submit for review failed', e);
        } finally {
            this.publishing = false;
        }
    }

    handleRequestHuman() {
        this.helpSource = 'editor';
        this.helpOpen = true;
    }

    // "Maximize" via <dialog>.showModal() — the browser top layer. The top layer
    // positions against the viewport and ignores every ancestor transform/
    // overflow/z-index the Experience page wraps us in (a plain position:fixed
    // overlay gets trapped by a transformed ancestor and left the page collapsed
    // and black behind it). The native Fullscreen API stays off-limits — LWS
    // blocks requestFullscreen/fullscreenElement. Escape closes the dialog
    // natively; onclose (handleShellClose) keeps `fullscreen` in sync.
    handleFullscreenToggle() {
        const dlg = this.template.querySelector('dialog.shell');
        if (!dlg) {
            return;
        }
        if (dlg.open) {
            dlg.close();
        } else {
            try {
                dlg.showModal();
                this.fullscreen = true;
            } catch (e) {
                this.reportError('Could not maximize the editor', e);
            }
        }
    }

    // Fires on dialog close — whether from the toolbar toggle or native Escape.
    handleShellClose() {
        this.fullscreen = false;
    }

    // ---- no site yet (starting) fallback ----------------------------------
    handleGoHome() {
        this[NavigationMixin.Navigate]({
            type: 'standard__webPage',
            attributes: { url: '/' }
        });
    }

    // Skip the questionnaire and start editing immediately on a blank canvas.
    // Seeds the store directly (we're already in the editor context), which
    // flips `starting` false and renders the empty Home page.
    handleStartBlank() {
        store.newBlankSite();
    }

    // ---- page rail -------------------------------------------------------
    handleSelectPage(event) {
        this.activePageId = event.detail.pageId;
        this.clearSelection();
    }

    // A nav-header link was clicked. In preview this is real navigation — switch
    // the active page. In edit mode the header is inert (you're building, not
    // browsing), so the nav header never emits this while editing.
    handleNavigate(event) {
        const { pageId } = event.detail;
        if (this.mode === 'edit') {
            return;
        }
        if (this.pages.some((p) => p.pageId === pageId)) {
            this.activePageId = pageId;
            this.clearSelection();
        }
    }

    // ---- canvas ----------------------------------------------------------
    clearSelection() {
        this.selectedSectionId = undefined;
        this.selectedSectionIds = [];
    }

    selectSingle(sectionId) {
        this.selectedSectionId = sectionId;
        this.selectedSectionIds = sectionId ? [sectionId] : [];
    }

    /**
     * A plain click replaces the selection; a Ctrl/Cmd/Shift click (additive)
     * toggles the clicked section in and out of the multi-selection. A null
     * sectionId (the canvas bar's Clear) empties it.
     */
    handleSectionSelect(event) {
        const { sectionId, additive } = event.detail;
        if (!sectionId) {
            this.clearSelection();
            return;
        }
        if (additive) {
            const ids = [...this.selectedSectionIds];
            const at = ids.indexOf(sectionId);
            if (at === -1) {
                ids.push(sectionId);
                this.selectedSectionId = sectionId;
            } else {
                ids.splice(at, 1);
                if (this.selectedSectionId === sectionId) {
                    this.selectedSectionId = ids[ids.length - 1];
                }
            }
            this.selectedSectionIds = ids;
        } else {
            this.selectSingle(sectionId);
        }
        this.rightTab = 'settings'; // jump to settings when a section is picked
    }

    // ---- right panel tabs ------------------------------------------------
    showSettingsTab() {
        this.rightTab = 'settings';
    }

    openThemePopup() {
        this.themePopupOpen = true;
    }

    closeThemePopup() {
        this.themePopupOpen = false;
    }

    showLayersTab() {
        this.rightTab = 'layers';
    }

    showHistoryTab() {
        this.rightTab = 'history';
    }

    // ---- section library -------------------------------------------------
    openLibrary() {
        this.libraryOpen = true;
    }

    closeLibrary() {
        this.libraryOpen = false;
    }

    handleSectionAdded(event) {
        this.selectSingle(event.detail.sectionId);
        this.libraryOpen = false;
    }

    get pasteLabel() {
        return this.clipboard ? `Paste ${this.clipboard.type}` : '';
    }

    handlePaste() {
        const sectionId = store.pasteSection(this.activePageId);
        if (sectionId) {
            this.selectSingle(sectionId);
        }
    }

    // ---- human request / polish CTA -------------------------------------
    openPreviewHelp() {
        this.helpSource = 'preview';
        this.helpOpen = true;
    }

    closeHelp() {
        this.helpOpen = false;
    }

    // ---- saving ----------------------------------------------------------
    scheduleAutosave() {
        if (!store.isDirty() || !store.getRecordId()) {
            return;
        }
        window.clearTimeout(this._autosaveTimer);
        // eslint-disable-next-line @lwc/lwc/no-async-operation -- debounce; cleared above and re-armed per change
        this._autosaveTimer = window.setTimeout(() => this.doSave('Autosaved'), AUTOSAVE_DELAY);
    }

    async doSave(successLabel) {
        if (this.saving || !store.isDirty()) {
            return;
        }
        window.clearTimeout(this._autosaveTimer);
        this.saving = true;
        try {
            await store.save();
            this.flashStatus(successLabel);
        } catch (e) {
            this.reportError('Save failed', e);
        } finally {
            this.saving = false;
        }
    }

    // ---- status ----------------------------------------------------------
    flashStatus(text) {
        this.statusText = text;
        window.clearTimeout(this._statusTimer);
        // eslint-disable-next-line @lwc/lwc/no-async-operation -- transient status text; cleared above
        this._statusTimer = window.setTimeout(() => {
            this.statusText = '';
        }, STATUS_CLEAR_DELAY);
    }

    reportError(prefix, error) {
        const detail = (error && (error.body?.message || error.message)) || 'Unknown error';
        console.error(`siteEditorShell: ${prefix}`, error);
        this.flashStatus(`${prefix}: ${detail}`);
    }
}