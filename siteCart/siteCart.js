/**
 * siteCart — F13b. Floating cart icon + drawer, mounted once in pageCanvas so
 * it's shared by both the editor's Preview mode and sitePublicRenderer (the
 * real published site) — both instantiate c-page-canvas with mode="live".
 * Never rendered while editing (see pageCanvas.html's mode gate) — a
 * persistent floating widget over the canvas while dragging/editing sections
 * would just be in the way, same call F9/F11 made for their Preview-only UI.
 *
 * Checkout is per-item, not unified: each cart line still pays through its
 * own product's Buy_Link__c (a Square Checkout Link, typically). There is no
 * multi-item payment API integration here — see cartService's header comment
 * and F13b's roadmap note for why.
 */
import { LightningElement, api } from 'lwc';
import { getCart, updateQty, removeItem, clearCart, CART_CHANGE_EVENT } from 'c/cartService';

export default class SiteCart extends LightningElement {
    @api siteId;
    @api hasShop = false;

    items = [];
    open = false;

    connectedCallback() {
        this._onChange = (event) => {
            if (!event.detail || event.detail.siteId === this.siteId) {
                this.refresh();
            }
        };
        window.addEventListener(CART_CHANGE_EVENT, this._onChange);
        this.refresh();
    }

    disconnectedCallback() {
        window.removeEventListener(CART_CHANGE_EVENT, this._onChange);
    }

    refresh() {
        this.items = this.siteId ? getCart(this.siteId) : [];
    }

    get hasItems() {
        return this.items.length > 0;
    }

    get count() {
        return this.items.reduce((n, i) => n + i.qty, 0);
    }

    get visible() {
        return !!this.siteId && (this.hasShop || this.hasItems);
    }

    get decoratedItems() {
        return this.items.map((i) => ({
            ...i,
            priceLabel: this._fmt(i.price),
            lineTotalLabel: this._fmt(i.price * i.qty),
            imageStyle: i.imageUrl ? `background-image:url('${i.imageUrl}')` : '',
            atMin: i.qty <= 1
        }));
    }

    get subtotalLabel() {
        return this._fmt(this.items.reduce((s, i) => s + i.price * i.qty, 0));
    }

    _fmt(value) {
        try {
            return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(value || 0);
        } catch {
            return `$${value || 0}`;
        }
    }

    toggleOpen() {
        this.open = !this.open;
    }

    closeDrawer() {
        this.open = false;
    }

    stopPropagation(event) {
        event.stopPropagation();
    }

    handleIncrease(event) {
        const id = event.currentTarget.dataset.id;
        const item = this.items.find((i) => i.productId === id);
        if (item) {
            updateQty(this.siteId, id, item.qty + 1);
        }
    }

    handleDecrease(event) {
        const id = event.currentTarget.dataset.id;
        const item = this.items.find((i) => i.productId === id);
        if (item) {
            updateQty(this.siteId, id, item.qty - 1);
        }
    }

    handleRemove(event) {
        removeItem(this.siteId, event.currentTarget.dataset.id);
    }

    handleClear() {
        clearCart(this.siteId);
    }

    handlePay(event) {
        const url = event.currentTarget.dataset.link;
        if (url) {
            window.open(url, '_blank', 'noopener');
        }
    }
}
