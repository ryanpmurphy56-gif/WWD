/**
 * versionHistoryPanel — lists this site's published versions (one snapshot
 * per Publish, newest first) with a Restore action, mounted as the "History"
 * right-panel tab alongside Properties/Layers/Settings.
 *
 * Talks to the store directly, same as layersPanel — versions aren't part of
 * SiteConfig, so there's nothing for siteEditorShell to pass down as a prop.
 * Restore only ever writes into the DRAFT (store.restoreVersion); it never
 * republishes on its own, so a confirm is enough of a safety net — Undo also
 * still works afterward like any other store commit.
 */
import { LightningElement, track } from 'lwc';
import store from 'c/siteStateService';

export default class VersionHistoryPanel extends LightningElement {
    @track versions = [];
    loading = false;
    error = '';

    connectedCallback() {
        this.refresh();
    }

    async refresh() {
        this.loading = true;
        this.error = '';
        try {
            this.versions = await store.getVersions();
        } catch (e) {
            this.error = 'Could not load version history.';
        } finally {
            this.loading = false;
        }
    }

    get rows() {
        return (this.versions || []).map((v) => ({
            id: v.id,
            name: v.name,
            dateLabel: v.publishedAt ? new Date(v.publishedAt).toLocaleString() : ''
        }));
    }

    get isEmpty() {
        return !this.loading && !this.error && this.rows.length === 0;
    }

    async handleRestore(event) {
        const { versionId } = event.currentTarget.dataset;
        // eslint-disable-next-line no-alert
        if (
            !window.confirm(
                'Replace your current draft with this version? Unsaved changes will be lost. This does not go live until you Publish again.'
            )
        ) {
            return;
        }
        this.error = '';
        try {
            await store.restoreVersion(versionId);
        } catch (e) {
            this.error = 'Could not restore that version.';
        }
    }
}