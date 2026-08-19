import { LightningElement, api } from 'lwc';

function resolveActivePrice(item) {
    const family = (item.ProductFamily || '').toLowerCase();
    const has = v => { const n = Number(v); return Number.isFinite(n) && n > 0; };
    const isMember = item.IsMember;

    if (family === 'beer') {
        if (isMember) {
            if (has(item.MemberSixPackPrice)) return Number(item.MemberSixPackPrice);
            if (has(item.MemberSlabPrice))    return Number(item.MemberSlabPrice);
            if (has(item.MemberPrice))        return Number(item.MemberPrice);
        }
        if (has(item.SixPackPrice)) return Number(item.SixPackPrice);
        if (has(item.SlabPrice))    return Number(item.SlabPrice);
        return Number(item.RegularPrice) || 0;
    }

    if (isMember && has(item.MemberPrice)) return Number(item.MemberPrice);
    return Number(item.RegularPrice) || 0;
}

export default class CartPopup extends LightningElement {
    @api cartItems = [];
    @api cartCount = 0;
    @api lastAddedProduct;

    get enrichedItems() {
        if (!this.cartItems) return [];
        const fmt = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });
        return this.cartItems.map(item => ({
            ...item,
            _displayQty: Number(item.Quantity) || 0,
            _formattedTotal: fmt.format(resolveActivePrice(item) * (Number(item.Quantity) || 0))
        }));
    }

    get cartTotal() {
        if (!this.cartItems || !this.cartItems.length) return '$0.00';
        const total = this.cartItems.reduce((sum, item) => {
            return sum + resolveActivePrice(item) * (Number(item.Quantity) || 0);
        }, 0);
        return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(total);
    }

    get hasItems()      { return this.cartItems && this.cartItems.length > 0; }
    get lastAddedName() { return this.lastAddedProduct ? this.lastAddedProduct.Name : 'Item'; }

    handleClose()    { this.dispatchEvent(new CustomEvent('close')); }
    handleViewCart() { this.dispatchEvent(new CustomEvent('viewcart')); }
}