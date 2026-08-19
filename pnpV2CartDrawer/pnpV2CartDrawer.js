import { LightningElement, track } from 'lwc';
import getCartItems from '@salesforce/apex/CartController.getCartItems';
import getCartCount from '@salesforce/apex/CartController.getCartCount';
import clearCart from '@salesforce/apex/CartController.clearCart';
import { getSessionUID } from 'c/sessionService';
import { slideInRight } from 'c/pnpGsap';

function resolveActivePrice(item) {
    const family = (item.ProductFamily || '').toLowerCase();
    const fmt    = (item.SelectedFormat || '').toLowerCase();
    const has    = v => { const n = Number(v); return Number.isFinite(n) && n > 0; };
    const isMem  = item.IsMember;
    if (family === 'beer') {
        if (fmt.includes('slab')) {
            if (isMem && has(item.MemberSlabPrice)) return Number(item.MemberSlabPrice);
            if (has(item.SlabPrice)) return Number(item.SlabPrice);
        }
        if (fmt.includes('six') || fmt.includes('6') || fmt.includes('pack')) {
            if (isMem && has(item.MemberSixPackPrice)) return Number(item.MemberSixPackPrice);
            if (has(item.SixPackPrice)) return Number(item.SixPackPrice);
        }
    }
    if (isMem && has(item.MemberPrice)) return Number(item.MemberPrice);
    return Number(item.RegularPrice) || 0;
}

export default class PnpV2CartDrawer extends LightningElement {
    @track cartItems = [];
    cartCount  = 0;
    sessionUID = getSessionUID();

    connectedCallback() { this.loadCart(); }

    renderedCallback() {
        if (this._slideDone) return;
        this._slideDone = true;
        slideInRight(this, '.cart-popup');
    }

    loadCart() {
        Promise.all([
            getCartItems({ uid: this.sessionUID }),
            getCartCount({ uid: this.sessionUID })
        ])
            .then(([items, count]) => {
                this.cartItems = items || [];
                this.cartCount = count || 0;
                this.dispatchEvent(new CustomEvent('cartcountchange', {
                    detail: { count: this.cartCount }, bubbles: true, composed: true
                }));
            })
            .catch(() => {
                this.cartItems = [];
                this.cartCount = 0;
            });
    }

    get enrichedItems() {
        const fmt = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });
        return (this.cartItems || []).map((item) => ({
            ...item,
            _displayQty:     Number(item.Quantity) || 0,
            _formattedTotal: fmt.format(resolveActivePrice(item) * (Number(item.Quantity) || 0))
        }));
    }

    get cartTotal() {
        const total = (this.cartItems || []).reduce(
            (sum, item) => sum + resolveActivePrice(item) * (Number(item.Quantity) || 0), 0
        );
        return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(total);
    }

    get hasItems()          { return this.cartItems && this.cartItems.length > 0; }
    get isCheckoutDisabled(){ return !this.hasItems; }

    handleClose()    { this.dispatchEvent(new CustomEvent('close')); }
    handleViewCart() { this.dispatchEvent(new CustomEvent('viewcart', { bubbles: true, composed: true })); }

    // Inline two-step confirm (window.confirm is blocked by Lightning Web Security)
    @track confirmingClear = false;
    _confirmClearTimer = null;

    handleClearCartClick() {
        this.confirmingClear = true;
        clearTimeout(this._confirmClearTimer);
        this._confirmClearTimer = setTimeout(() => { this.confirmingClear = false; }, 6000);
    }

    handleClearCartKeep() {
        clearTimeout(this._confirmClearTimer);
        this.confirmingClear = false;
    }

    handleClearCartConfirm() {
        clearTimeout(this._confirmClearTimer);
        this.confirmingClear = false;
        clearCart({ uid: this.sessionUID })
            .then(() => {
                this.cartItems = [];
                this.cartCount = 0;
                this.dispatchEvent(new CustomEvent('cartcountchange', {
                    detail: { count: 0 }, bubbles: true, composed: true
                }));
            })
            .catch((err) => { console.error('Clear cart failed:', err?.body?.message || err); });
    }

    disconnectedCallback() {
        clearTimeout(this._confirmClearTimer);
    }
}