/**
 * portfolioManagerModal — CRUD UI for a site's portfolio items (F8b CMS).
 * Same shape as blogManagerModal/productManagerModal: talks to
 * WebsuitePortfolioController directly rather than through
 * siteStateService, since items aren't part of SiteConfig and don't belong
 * on the undo stack or autosave path.
 */
import { LightningElement, api, track } from 'lwc';
import getPortfolioItems from '@salesforce/apex/WebsuitePortfolioController.getPortfolioItems';
import savePortfolioItem from '@salesforce/apex/WebsuitePortfolioController.savePortfolioItem';
import deletePortfolioItem from '@salesforce/apex/WebsuitePortfolioController.deletePortfolioItem';

const BLANK_DRAFT = {
    id: null,
    title: '',
    category: '',
    description: '',
    imageAssetId: null,
    imageUrl: null,
    projectUrl: '',
    isActive: true
};

export default class PortfolioManagerModal extends LightningElement {
    @api siteId;

    @track items = [];
    @track draft = null;
    loading = true;
    saving = false;
    errorText = '';

    connectedCallback() {
        this.load();
    }

    async load() {
        this.loading = true;
        try {
            const rows = await getPortfolioItems({ siteId: this.siteId });
            this.items = rows.map((i) => ({ ...i, statusLabel: i.isActive ? 'Active' : 'Inactive' }));
        } catch (e) {
            this.errorText = (e && e.body && e.body.message) || 'Could not load portfolio items.';
        } finally {
            this.loading = false;
        }
    }

    get isEditing() {
        return !!this.draft;
    }
    get hasItems() {
        return this.items.length > 0;
    }
    get formTitle() {
        return this.draft && this.draft.id ? 'Edit portfolio item' : 'New portfolio item';
    }

    handleNewItem() {
        this.draft = { ...BLANK_DRAFT };
    }

    handleEditItem(event) {
        const id = event.currentTarget.dataset.id;
        const item = this.items.find((i) => i.id === id);
        if (item) {
            this.draft = { ...item };
        }
    }

    async handleDeleteItem(event) {
        const id = event.currentTarget.dataset.id;
        // eslint-disable-next-line no-alert
        if (!window.confirm('Delete this portfolio item? This cannot be undone.')) {
            return;
        }
        try {
            await deletePortfolioItem({ itemId: id });
            this.items = this.items.filter((i) => i.id !== id);
        } catch (e) {
            this.errorText = (e && e.body && e.body.message) || 'Could not delete that portfolio item.';
        }
    }

    handleCancelEdit() {
        this.draft = null;
        this.errorText = '';
    }

    handleTitleChange(event) {
        this.draft = { ...this.draft, title: event.target.value };
    }
    handleCategoryChange(event) {
        this.draft = { ...this.draft, category: event.target.value };
    }
    handleDescriptionChange(event) {
        this.draft = { ...this.draft, description: event.target.value };
    }
    handleProjectUrlChange(event) {
        this.draft = { ...this.draft, projectUrl: event.target.value };
    }
    handleActiveChange(event) {
        this.draft = { ...this.draft, isActive: event.target.checked };
    }
    handleImageUploaded(event) {
        const { assetId, url } = event.detail;
        this.draft = { ...this.draft, imageAssetId: assetId, imageUrl: url };
    }
    handleImageRemove() {
        this.draft = { ...this.draft, imageAssetId: null, imageUrl: null };
    }

    get saveDisabled() {
        return this.saving || !this.draft || !this.draft.title.trim();
    }
    get saveLabel() {
        return this.saving ? 'Saving…' : 'Save';
    }

    async handleSaveDraft() {
        this.saving = true;
        this.errorText = '';
        try {
            const id = await savePortfolioItem({
                siteId: this.siteId,
                itemId: this.draft.id,
                title: this.draft.title,
                category: this.draft.category,
                description: this.draft.description,
                imageAssetId: this.draft.imageAssetId,
                imageUrl: this.draft.imageUrl,
                projectUrl: this.draft.projectUrl,
                isActive: this.draft.isActive
            });
            this.draft = { ...this.draft, id };
            await this.load();
            this.draft = null;
        } catch (e) {
            this.errorText = (e && e.body && e.body.message) || 'Could not save that portfolio item.';
        } finally {
            this.saving = false;
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