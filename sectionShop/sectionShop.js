/**
 * sectionShop — F13/F13b: renders live from Websuite_Product__c records
 * (getActiveProducts), same "dynamic, not SiteConfig" pattern as
 * sectionBlogList. "Add to cart" (via c/cartService) lets a visitor collect
 * several products; checkout is still per-item through each product's own
 * Buy Link (a Square Checkout Link, typically) — see c/siteCart, mounted in
 * pageCanvas, for the drawer/checkout UI. Products are managed from the
 * Properties panel's "Manage products" button (see productManagerModal), not
 * inline here.
 */
import { LightningElement, api } from 'lwc';
import getActiveProducts from '@salesforce/apex/WebsuiteProductController.getActiveProducts';
import { sectionRootClass, sectionRootStyle, fieldStyle, commitField } from 'c/sectionCommon';
import { addItem } from 'c/cartService';

export default class SectionShop extends LightningElement {
    @api content = {};
    @api sectionStyle = {};
    @api variant = 'grid';
    @api layout = {};
    @api mode = 'live';
    @api siteId;

    products = [];
    loading = false;
    _loadedFor;
    _addedTimers = {};

    disconnectedCallback() {
        Object.values(this._addedTimers).forEach(clearTimeout);
    }

    get isEdit() {
        return this.mode === 'edit';
    }
    get rootClass() {
        return sectionRootClass('sec_shop', {
            variant: this.variant,
            style: this.sectionStyle,
            layout: this.layout,
            mode: this.mode
        });
    }
    get rootStyle() {
        return sectionRootStyle(this.sectionStyle);
    }
    get headingFieldStyle() {
        return fieldStyle(this.sectionStyle?.fields, 'heading');
    }
    get heading() {
        return this.content?.heading || '';
    }
    get gridClass() {
        return this.variant === 'list' ? 'shop__grid shop__grid_list' : 'shop__grid';
    }
    get editableAttr() {
        return this.isEdit ? 'true' : 'false';
    }

    get hasProducts() {
        return this.products.length > 0;
    }
    get hasSite() {
        return !!this.siteId;
    }
    get showEmptyNoSite() {
        return this.isEdit && !this.hasSite;
    }
    get showEmptyNoProducts() {
        return this.isEdit && this.hasSite && !this.loading && !this.hasProducts;
    }

    renderedCallback() {
        if (!this.siteId || this.siteId === this._loadedFor) {
            return;
        }
        this._loadedFor = this.siteId;
        this.loading = true;
        getActiveProducts({ siteId: this.siteId })
            .then((rows) => {
                this.products = (rows || []).map((p) => ({
                    id: p.id,
                    name: p.name,
                    description: p.description,
                    price: p.price,
                    priceLabel: this.formatPrice(p.price),
                    hasImage: !!p.imageUrl,
                    imageUrl: p.imageUrl,
                    imageStyle: p.imageUrl ? `background-image:url('${p.imageUrl}')` : '',
                    buyLink: p.buyLink,
                    hasBuyLink: !!p.buyLink,
                    addLabel: 'Add to cart'
                }));
            })
            .catch(() => {
                this.products = [];
            })
            .finally(() => {
                this.loading = false;
            });
    }

    formatPrice(value) {
        if (value === null || value === undefined || value === '') {
            return '';
        }
        try {
            return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(value);
        } catch {
            return `$${value}`;
        }
    }

    handleKeydown(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            event.target.blur();
        }
    }
    handleHeadingEdit(event) {
        commitField(this, event, this.content);
    }

    // "Add to cart" only does anything meaningful in live/preview — editing
    // has no visitor session to hold a cart for, so it's a no-op there.
    handleAddToCart(event) {
        if (this.isEdit || !this.siteId) {
            return;
        }
        const id = event.currentTarget.dataset.id;
        const product = this.products.find((p) => p.id === id);
        if (!product) {
            return;
        }
        addItem(this.siteId, product, 1);
        this.products = this.products.map((p) => (p.id === id ? { ...p, addLabel: 'Added ✓' } : p));
        clearTimeout(this._addedTimers[id]);
        this._addedTimers[id] = setTimeout(() => {
            this.products = this.products.map((p) => (p.id === id ? { ...p, addLabel: 'Add to cart' } : p));
        }, 1500);
    }
}