/**
 * publishHistoryModal — lists a site's publish snapshots (newest first) with
 * a Restore action per row. Restoring rolls the DRAFT back to that snapshot
 * (see siteStateService.restoreVersion) so it can be reviewed before
 * publishing again; it never touches what's currently live.
 */
import { LightningElement, track } from 'lwc';
import store from 'c/siteStateService';

export default class PublishHistoryModal extends LightningElement {
    @track versions = [];
    loading = true;
    errorText = '';
    // Two-step confirm inline in the row, rather than a second modal.
    confirmingId = null;
    restoringId = null;

    connectedCallback() {
        this.load();
    }

    async load() {
        this.loading = true;
        try {
            const rows = await store.getVersionHistory();
            this.versions = rows.map((v) => ({
                id: v.id,
                label: this.formatDate(v.publishedAt)
            }));
        } catch (e) {
            this.errorText = (e && e.body && e.body.message) || 'Could not load publish history.';
        } finally {
            this.loading = false;
        }
    }

    formatDate(iso) {
        if (!iso) {
            return 'Unknown time';
        }
        try {
            return new Date(iso).toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short'
            });
        } catch {
            return iso;
        }
    }

    get hasVersions() {
        return this.versions.length > 0;
    }

    get rows() {
        return this.versions.map((v) => {
            const restoring = v.id === this.restoringId;
            return {
                ...v,
                confirming: v.id === this.confirmingId,
                restoring,
                confirmLabel: restoring ? 'Restoring…' : 'Yes, restore',
                disabled: !!this.restoringId
            };
        });
    }

    handleRestoreClick(event) {
        this.confirmingId = event.currentTarget.dataset.id;
    }

    handleCancelConfirm() {
        this.confirmingId = null;
    }

    async handleConfirmRestore(event) {
        const versionId = event.currentTarget.dataset.id;
        this.restoringId = versionId;
        this.errorText = '';
        try {
            await store.restoreVersion(versionId);
            this.dispatchEvent(new CustomEvent('restored'));
            this.close();
        } catch (e) {
            this.errorText = (e && e.body && e.body.message) || 'Could not restore that version.';
            this.restoringId = null;
            this.confirmingId = null;
        }
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