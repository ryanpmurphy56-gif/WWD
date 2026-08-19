/**
 * assetLibrary — modal grid of every file uploaded for this site, so an asset
 * can be reused without re-uploading. Emits `select` ({assetId, url}) or `close`.
 *
 * Assets are organised into FOLDERS, TAGS, and a RECENT view. The files live
 * in Salesforce Files (images and video side by side — `mediaKind` narrows the
 * grid for a caller that only wants one); the folders/tags/recent list live in
 * the SiteConfig via the store (config.library), so they save/undo with the
 * rest of the site and need no new object. A folder or the Recent chip narrows
 * the grid to one axis, an optional tag narrows further, and the search box
 * filters by filename on top of whatever's active. Each tile has a small
 * dropdown to move that asset between folders, plus a tag editor.
 */
import { LightningElement, api } from 'lwc';
import getAssets from '@salesforce/apex/WebsuiteAssetController.getAssets';
import store from 'c/siteStateService';

const ALL = 'all';
const UNFILED = 'unfiled';
const RECENT = 'recent';
// Salesforce ContentVersion.FileType values (uppercase) that mean "this file
// is a video" — everything else renders as an image tile, matching this
// library's behaviour before video existed.
const VIDEO_FILE_TYPES = new Set(['MP4', 'MOV', 'WEBM', 'OGV', 'OGG', 'M4V', 'AVI', 'MKV', 'WMV']);

export default class AssetLibrary extends LightningElement {
    @api siteId;
    // 'all' | 'image' | 'video' — narrows the grid for a caller that only
    // wants one kind (imageUploader's library vs. videoUploader's).
    @api mediaKind = 'all';

    assets = [];
    loading = true;
    error = '';

    folders = [];
    assignments = {};
    tags = {};
    recent = [];
    activeFolder = ALL;
    activeTag = '';
    searchTerm = '';

    connectedCallback() {
        this.refreshLibrary();
        getAssets({ siteId: this.siteId })
            .then((items) => {
                this.assets = (items || []).map((a) => ({
                    ...a,
                    kind: VIDEO_FILE_TYPES.has((a.fileType || '').toUpperCase()) ? 'video' : 'image'
                }));
            })
            .catch((e) => {
                this.error = (e && e.body && e.body.message) || 'Could not load your files.';
            })
            .finally(() => {
                this.loading = false;
            });
    }

    // Folder/tag/recent state is owned by the store; pull a fresh copy after
    // every change we make to it (same manual-refresh pattern sectionLibrary
    // uses for presets).
    refreshLibrary() {
        const { folders, assignments, tags, recent } = store.assetLibrary();
        this.folders = folders;
        this.assignments = assignments;
        this.tags = tags;
        this.recent = recent;
    }

    // ---- media-kind scoping -------------------------------------------------
    get kindFilteredAssets() {
        if (this.mediaKind === 'image' || this.mediaKind === 'video') {
            return this.assets.filter((a) => a.kind === this.mediaKind);
        }
        return this.assets;
    }

    // ---- counts -----------------------------------------------------------
    _countIn(folderId) {
        const list = this.kindFilteredAssets;
        if (folderId === ALL) {
            return list.length;
        }
        if (folderId === UNFILED) {
            return list.filter((a) => !this.assignments[a.assetId]).length;
        }
        if (folderId === RECENT) {
            const recentSet = new Set(this.recent);
            return list.filter((a) => recentSet.has(a.assetId)).length;
        }
        return list.filter((a) => this.assignments[a.assetId] === folderId).length;
    }

    // ---- folder chips (Recent sits with All/Unfiled — it's a view, not a
    // real folder — then one chip per real folder) ---------------------------
    get folderChips() {
        const chip = (id, label) => ({
            id,
            label,
            count: this._countIn(id),
            cssClass: id === this.activeFolder ? 'fchip fchip_on' : 'fchip'
        });
        return [
            chip(ALL, 'All'),
            chip(RECENT, 'Recent'),
            chip(UNFILED, 'Unfiled'),
            ...this.folders.map((f) => chip(f.id, f.name))
        ];
    }

    get activeFolderIsReal() {
        return this.activeFolder !== ALL && this.activeFolder !== UNFILED && this.activeFolder !== RECENT;
    }

    get activeFolderName() {
        const f = this.folders.find((x) => x.id === this.activeFolder);
        return f ? f.name : '';
    }

    // ---- tag chips ----------------------------------------------------------
    get tagChips() {
        const counts = {};
        this.kindFilteredAssets.forEach((a) => {
            (this.tags[a.assetId] || []).forEach((t) => {
                counts[t] = (counts[t] || 0) + 1;
            });
        });
        return Object.keys(counts)
            .sort((a, b) => a.localeCompare(b))
            .map((t) => ({
                tag: t,
                count: counts[t],
                cssClass: t === this.activeTag ? 'fchip fchip_on' : 'fchip'
            }));
    }

    get hasTags() {
        return this.tagChips.length > 0;
    }

    handleTagSelect(event) {
        const { tag } = event.currentTarget.dataset;
        this.activeTag = this.activeTag === tag ? '' : tag;
    }

    // ---- search ---------------------------------------------------------
    handleSearch(event) {
        this.searchTerm = event.target.value || '';
    }

    // ---- grid -------------------------------------------------------------
    get visibleAssets() {
        let list = this.kindFilteredAssets;
        if (this.activeFolder === UNFILED) {
            list = list.filter((a) => !this.assignments[a.assetId]);
        } else if (this.activeFolder === RECENT) {
            const order = this.recent;
            const inRecent = new Set(order);
            list = list.filter((a) => inRecent.has(a.assetId)).sort((a, b) => order.indexOf(a.assetId) - order.indexOf(b.assetId));
        } else if (this.activeFolder !== ALL) {
            list = list.filter((a) => this.assignments[a.assetId] === this.activeFolder);
        }
        if (this.activeTag) {
            list = list.filter((a) => (this.tags[a.assetId] || []).includes(this.activeTag));
        }
        const term = this.searchTerm.trim().toLowerCase();
        if (term) {
            list = list.filter((a) => (a.title || '').toLowerCase().includes(term));
        }
        return list.map((a) => ({
            ...a,
            isVideo: a.kind === 'video',
            tagText: (this.tags[a.assetId] || []).join(', '),
            folderOptions: [
                { value: '', label: 'Unfiled', selected: !this.assignments[a.assetId] },
                ...this.folders.map((f) => ({
                    value: f.id,
                    label: f.name,
                    selected: this.assignments[a.assetId] === f.id
                }))
            ]
        }));
    }

    get isEmpty() {
        return !this.loading && !this.error && this.kindFilteredAssets.length === 0;
    }

    get folderEmpty() {
        return !this.loading && !this.error && this.kindFilteredAssets.length > 0 && this.visibleAssets.length === 0;
    }

    // ---- folder actions ---------------------------------------------------
    handleFolderSelect(event) {
        this.activeFolder = event.currentTarget.dataset.folder;
    }

    handleNewFolder() {
        // eslint-disable-next-line no-alert
        const name = window.prompt('New folder name:', '');
        if (name && name.trim()) {
            const id = store.addAssetFolder(name);
            this.refreshLibrary();
            this.activeFolder = id;
        }
    }

    handleRenameFolder() {
        // eslint-disable-next-line no-alert
        const name = window.prompt('Rename folder:', this.activeFolderName);
        if (name && name.trim()) {
            store.renameAssetFolder(this.activeFolder, name);
            this.refreshLibrary();
        }
    }

    handleDeleteFolder() {
        // eslint-disable-next-line no-alert
        if (window.confirm('Delete this folder? Its files move back to Unfiled — the files themselves are kept.')) {
            store.deleteAssetFolder(this.activeFolder);
            this.activeFolder = ALL;
            this.refreshLibrary();
        }
    }

    handleAssign(event) {
        const { assetId } = event.currentTarget.dataset;
        store.setAssetFolder(assetId, event.target.value || null);
        this.refreshLibrary();
    }

    handleTagChange(event) {
        const { assetId } = event.currentTarget.dataset;
        store.setAssetTags(assetId, event.target.value.split(','));
        this.refreshLibrary();
    }

    // ---- pick / chrome ----------------------------------------------------
    handlePick(event) {
        const { assetId, url } = event.currentTarget.dataset;
        store.touchRecentAsset(assetId);
        this.dispatchEvent(new CustomEvent('select', { detail: { assetId, url } }));
    }

    close() {
        this.dispatchEvent(new CustomEvent('close'));
    }

    handleBackdrop() {
        this.close();
    }

    stop(event) {
        event.stopPropagation();
    }
}