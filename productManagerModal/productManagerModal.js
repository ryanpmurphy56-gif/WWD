/**
 * productManagerModal — CRUD UI for a site's Shop products (F13, scoped
 * down). Same shape as blogManagerModal: talks to WebsuiteProductController
 * directly rather than through siteStateService, since products aren't part
 * of SiteConfig and don't belong on the undo stack or autosave path.
 */
import { LightningElement, api, track } from 'lwc';
import getProducts from '@salesforce/apex/WebsuiteProductController.getProducts';
import saveProduct from '@salesforce/apex/WebsuiteProductController.saveProduct';
import deleteProduct from '@salesforce/apex/WebsuiteProductController.deleteProduct';

const BLANK_DRAFT = {
    id: null,
    name: '',
    price: null,
    description: '',
    imageAssetId: null,
    imageUrl: null,
    buyLink: '',
    isActive: true
};

export default class ProductManagerModal extends LightningElement {
    @api siteId;

    @track products = [];
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
            const rows = await getProducts({ siteId: this.siteId });
            this.products = rows.map((p) => ({ ...p, statusLabel: p.isActive ? 'Active' : 'Inactive' }));
        } catch (e) {
            this.errorText = (e && e.body && e.body.message) || 'Could not load products.';
        } finally {
            this.loading = false;
        }
    }

    get isEditing() {
        return !!this.draft;
    }
    get hasProducts() {
        return this.products.length > 0;
    }
    get formTitle() {
        return this.draft && this.draft.id ? 'Edit product' : 'New product';
    }

    handleNewProduct() {
        this.draft = { ...BLANK_DRAFT };
    }

    handleEditProduct(event) {
        const id = event.currentTarget.dataset.id;
        const product = this.products.find((p) => p.id === id);
        if (product) {
            this.draft = { ...product };
        }
    }

    async handleDeleteProduct(event) {
        const id = event.currentTarget.dataset.id;
        // eslint-disable-next-line no-alert
        if (!window.confirm('Delete this product? This cannot be undone.')) {
            return;
        }
        try {
            await deleteProduct({ productId: id });
            this.products = this.products.filter((p) => p.id !== id);
        } catch (e) {
            this.errorText = (e && e.body && e.body.message) || 'Could not delete that product.';
        }
    }

    handleCancelEdit() {
        this.draft = null;
        this.errorText = '';
    }

    handleNameChange(event) {
        this.draft = { ...this.draft, name: event.target.value };
    }
    handlePriceChange(event) {
        this.draft = { ...this.draft, price: event.target.value === '' ? null : Number(event.target.value) };
    }
    handleDescriptionChange(event) {
        this.draft = { ...this.draft, description: event.target.value };
    }
    handleBuyLinkChange(event) {
        this.draft = { ...this.draft, buyLink: event.target.value };
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
        return this.saving || !this.draft || !this.draft.name.trim();
    }
    get saveLabel() {
        return this.saving ? 'Saving…' : 'Save';
    }

    async handleSaveDraft() {
        this.saving = true;
        this.errorText = '';
        try {
            const id = await saveProduct({
                siteId: this.siteId,
                productId: this.draft.id,
                name: this.draft.name,
                price: this.draft.price,
                description: this.draft.description,
                imageAssetId: this.draft.imageAssetId,
                imageUrl: this.draft.imageUrl,
                buyLink: this.draft.buyLink,
                isActive: this.draft.isActive
            });
            this.draft = { ...this.draft, id };
            await this.load();
            this.draft = null;
        } catch (e) {
            this.errorText = (e && e.body && e.body.message) || 'Could not save that product.';
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