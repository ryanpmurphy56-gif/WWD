import { LightningElement, api, wire, track } from 'lwc';
import isGuestUser from '@salesforce/user/isGuest';

const PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 300' width='300' height='300'%3E%3Crect width='300' height='300' fill='%23f5f3ff'/%3E%3Crect x='118' y='60' width='64' height='18' rx='8' fill='%23c4b5fd'/%3E%3Crect x='112' y='78' width='76' height='14' rx='4' fill='%23a78bfa'/%3E%3Cellipse cx='150' cy='190' rx='46' ry='76' fill='%23c4b5fd'/%3E%3Cellipse cx='150' cy='190' rx='28' ry='58' fill='%23a78bfa'/%3E%3Ctext x='150' y='285' text-anchor='middle' fill='%237c3aed' font-size='18' font-family='sans-serif'%3ENo Image%3C/text%3E%3C/svg%3E";
import getProductById      from '@salesforce/apex/ProductGridController.getProductById';
import getRelatedProducts  from '@salesforce/apex/ProductGridController.getRelatedProducts';
import getRecommendations  from '@salesforce/apex/ProductGridController.getRecommendations';
import addToCart           from '@salesforce/apex/CartController.addToCart';
import checkIsMember       from '@salesforce/apex/CartController.checkIsMember';
import { fadeUpIn }        from 'c/pnpGsap';
import getWishlistStatus   from '@salesforce/apex/WishlistController.getWishlistStatus';
import addToWishlist       from '@salesforce/apex/WishlistController.addToWishlist';
import removeFromWishlist  from '@salesforce/apex/WishlistController.removeFromWishlist';
import { getSessionUID } from 'c/sessionService';
import { trackEvent } from 'c/funnelTracker';

export default class PnpV2ProductDetail extends LightningElement {
    @api productId;

    @track product         = null;
    @track relatedProducts = [];
    @track recommendations = [];
    @track formatOptions   = [];
    @track addedMessage    = '';
    @track errorMessage    = '';

    quantity         = 1;
    selectedFormat   = 'single';
    isMember         = false;
    sessionUID       = getSessionUID();
    isGuestUser      = isGuestUser;

    // Wishlist state
    _wishlistItemId  = null; // null = not saved, set = saved

    renderedCallback() {
        fadeUpIn(this, '.image-card, .top-grid > div:not(.image-card)', { stagger: 0.1 });
        fadeUpIn(this, '.product-card', { stagger: 0.05 });
    }

    @wire(getProductById, { productId: '$productId' })
    wiredProduct({ data, error }) {
        if (data) {
            this.product = data;
            this._buildFormatOptions(data);
            this._loadRelated(data);
            this._loadRecommendations(data.Id);
            if (!isGuestUser) this._loadWishlistStatus(data.Id);
            trackEvent('View', data.Id, { unitPrice: data.Price__c });
        } else if (error) {
            console.error('Product load error:', error);
        }
    }

    @wire(checkIsMember)
    wiredMember({ data }) {
        if (data !== undefined) this.isMember = data;
    }

    // ── Getters ───────────────────────────────────────────────────────────────

    get eyebrow() {
        if (!this.product) return '';
        return [this.product.Family, this.product.Product_Sub_Family__c]
            .filter(Boolean).join(' · ').toUpperCase();
    }

    get hasAbv()    { return this.product && this.product.Alcohol_By_Volume__c != null; }
    get abvDisplay(){ return this.product ? this.product.Alcohol_By_Volume__c + '%' : ''; }

    get hasVolume()    { return this.product && this.product.Volume_ml__c != null; }
    get volumeDisplay(){ return this.product ? this.product.Volume_ml__c + 'ml' : ''; }

    get hasOrigin() { return this.product && this.product.Origin_Country__c; }

    get isOutOfStock() {
        return this.product && this.product.Quantity_on_Hand__c != null && this.product.Quantity_on_Hand__c <= 0;
    }
    get stockClass() {
        if (!this.product) return 'stock';
        const qty = this.product.Quantity_on_Hand__c;
        if (qty != null && qty <= 0) return 'stock out-of-stock';
        if (qty != null && qty <= 5) return 'stock low-stock';
        return 'stock in-stock';
    }
    get stockLabel() {
        if (!this.product) return '';
        const qty = this.product.Quantity_on_Hand__c;
        if (qty == null)  return '✓ In Stock';
        if (qty <= 0)     return '✕ Out of Stock';
        if (qty <= 5)     return '⚠ Low Stock — Only ' + qty + ' left';
        return '✓ In Stock';
    }

    get productImageUrl() {
        return this.product?.Product_Image_Field__c || PLACEHOLDER;
    }

    handleImageError(event) {
        event.target.src = PLACEHOLDER;
    }

    get hasRelated() { return this.relatedProducts && this.relatedProducts.length > 0; }
    get hasRecommendations() { return this.recommendations && this.recommendations.length > 0; }

    get isWishlisted() { return this._wishlistItemId != null; }
    get wishlistIcon() { return this.isWishlisted ? '♥' : '♡'; }
    get wishlistTitle() { return this.isWishlisted ? 'Remove from Wishlist' : 'Save to Wishlist'; }
    get wishlistBtnClass() {
        return this.isWishlisted ? 'wishlist-btn wishlist-btn--saved' : 'wishlist-btn';
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    _buildFormatOptions(data) {
        const opts = [];
        if (data.Price__c) {
            const ms = this.isMember && data.Members_Price_Individual__c
                ? ' | Member $' + data.Members_Price_Individual__c : '';
            opts.push({
                selectLabel: 'Per Unit — $' + data.Price__c + ms,
                label:       'PER UNIT — $' + data.Price__c,
                value:       'single'
            });
        }
        if (data.Price_6_Pack_New__c) {
            const ms = this.isMember && data.Members_Price_6_Pack__c
                ? ' | Member $' + data.Members_Price_6_Pack__c : '';
            opts.push({
                selectLabel: '6 Pack — $' + data.Price_6_Pack_New__c + ms,
                label:       '6 PACK — $' + data.Price_6_Pack_New__c,
                value:       'six'
            });
        }
        if (data.Price_Slab_of_24_new__c) {
            const ms = this.isMember && data.Members_Price_Slab_of_24__c
                ? ' | Member $' + data.Members_Price_Slab_of_24__c : '';
            opts.push({
                selectLabel: 'Slab of 24 — $' + data.Price_Slab_of_24_new__c + ms,
                label:       'SLAB OF 24 — $' + data.Price_Slab_of_24_new__c,
                value:       'slab'
            });
        }
        this.formatOptions  = opts;
        this.selectedFormat = opts.length > 0 ? opts[0].value : 'single';
    }

    _loadRelated(data) {
        getRelatedProducts({ family: data.Family, excludeId: data.Id })
            .then((result) => { this.relatedProducts = result; })
            .catch((err)   => { console.error(err); this.relatedProducts = []; });
    }

    _loadRecommendations(productId) {
        getRecommendations({ productId })
            .then((result) => { this.recommendations = result; })
            .catch(() => { this.recommendations = []; });
    }

    _loadWishlistStatus(productId) {
        getWishlistStatus({ productId })
            .then((itemId) => { this._wishlistItemId = itemId; })
            .catch(() => { this._wishlistItemId = null; });
    }

    // ── Handlers ──────────────────────────────────────────────────────────────

    handleBack() {
        this.dispatchEvent(new CustomEvent('viewchange', {
            detail: { view: 'products' }, bubbles: true, composed: true
        }));
    }

    handleFormatChange(event) { this.selectedFormat = event.target.value; }

    get maxQty() {
        const stock = this.product?.Quantity_on_Hand__c;
        return (stock != null && Number.isFinite(Number(stock))) ? Math.max(Number(stock), 0) : 99;
    }
    get atMaxQty() { return this.quantity >= this.maxQty; }

    increaseQty() { if (this.quantity < this.maxQty) this.quantity += 1; }
    decreaseQty() { if (this.quantity > 1) this.quantity -= 1; }

    handleQtyChange(event) {
        let qty = parseInt(event.target.value, 10);
        if (!Number.isFinite(qty) || qty < 1) qty = 1;
        if (qty > this.maxQty) {
            qty = this.maxQty;
            this.errorMessage = `Only ${this.maxQty} in stock.`;
        }
        this.quantity = qty;
        event.target.value = String(qty); // reflect clamped value back into the input
    }

    handleAddToCart() {
        if (!this.product?.Id || this.isOutOfStock) return;
        this.addedMessage = '';
        this.errorMessage = '';
        addToCart({
            productId: this.product.Id,
            uid: this.sessionUID,
            selectedFormat: this.selectedFormat,
            quantity: this.quantity
        })
            .then(() => {
                trackEvent('Add_to_Cart', this.product.Id, {
                    quantity: this.quantity,
                    unitPrice: this.product.Price__c
                });
                this.addedMessage = this.quantity > 1
                    ? `✓ Added ${this.quantity} to cart!`
                    : '✓ Added to cart!';
                this.dispatchEvent(new CustomEvent('cartcountchange', {
                    detail: {
                        refresh: true,
                        addedItem: {
                            name: this.product.Name,
                            image: this.productImageUrl,
                            qty: this.quantity,
                            priceLabel: this.product.Price__c
                                ? '$' + Number(this.product.Price__c).toFixed(2) : ''
                        }
                    },
                    bubbles: true, composed: true
                }));
                setTimeout(() => { this.addedMessage = ''; }, 3000);
            })
            .catch((error) => {
                this.errorMessage = error?.body?.message || 'Could not add to cart.';
            });
    }

    handleWishlistToggle() {
        if (this.isWishlisted) {
            removeFromWishlist({ wishlistItemId: this._wishlistItemId })
                .then(() => { this._wishlistItemId = null; })
                .catch((err) => {
                    this.errorMessage = err?.body?.message || 'Could not remove from wishlist.';
                });
        } else {
            addToWishlist({ productId: this.product.Id })
                .then((itemId) => { this._wishlistItemId = itemId; })
                .catch((err) => {
                    this.errorMessage = err?.body?.message || 'Could not save to wishlist.';
                });
        }
    }

    handleRelatedClick(event) {
        if (event.target.classList.contains('related-add-btn')) return;
        const id = event.currentTarget.dataset.id;
        this.dispatchEvent(new CustomEvent('productselect', {
            detail: { productId: id }, bubbles: true, composed: true
        }));
    }

    handleRelatedAddToCart(event) {
        event.stopPropagation();
        const productId = event.currentTarget.dataset.id;
        const related = (this.relatedProducts || []).find((r) => r.Id === productId)
            || (this.recommendations || []).find((r) => r.Id === productId);
        addToCart({ productId, uid: this.sessionUID, selectedFormat: 'single' })
            .then(() => {
                this.dispatchEvent(new CustomEvent('cartcountchange', {
                    detail: {
                        refresh: true,
                        addedItem: {
                            name: related?.Name || 'Item',
                            image: related?.Product_Image_Field__c || related?.Image,
                            qty: 1,
                            priceLabel: related?.Price__c
                                ? '$' + Number(related.Price__c).toFixed(2)
                                : (related?.Price ? '$' + Number(related.Price).toFixed(2) : '')
                        }
                    },
                    bubbles: true, composed: true
                }));
            })
            .catch((error) => {
                this.errorMessage = error?.body?.message || 'Could not add to cart.';
            });
    }
}