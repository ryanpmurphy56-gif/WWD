import { LightningElement, track } from 'lwc';
import getWishlist       from '@salesforce/apex/WishlistController.getWishlist';
import removeFromWishlist from '@salesforce/apex/WishlistController.removeFromWishlist';
import moveToCart         from '@salesforce/apex/WishlistController.moveToCart';
import { getSessionUID } from 'c/sessionService';

export default class PnpV2Wishlist extends LightningElement {
    @track items        = [];
    @track errorMessage = '';

    sessionUID = getSessionUID();

    connectedCallback() {
        this._loadWishlist();
    }

    get hasItems()        { return this.items && this.items.length > 0; }
    get itemCount()       { return this.items ? this.items.length : 0; }
    get itemCountSuffix() { return this.itemCount === 1 ? '' : 's'; }

    _loadWishlist() {
        getWishlist()
            .then((result) => {
                this.items = result.map(i => ({
                    ...i,
                    cartDisabled: !i.InStock
                }));
            })
            .catch((err) => {
                this.errorMessage = err?.body?.message || 'Could not load wishlist.';
            });
    }

    handleRemove(event) {
        const wishlistItemId = event.currentTarget.dataset.id;
        removeFromWishlist({ wishlistItemId })
            .then(() => {
                this.items = this.items.filter(i => i.Id !== wishlistItemId);
            })
            .catch((err) => {
                this.errorMessage = err?.body?.message || 'Could not remove item.';
            });
    }

    handleMoveToCart(event) {
        const wishlistItemId = event.currentTarget.dataset.id;
        moveToCart({ wishlistItemId, uid: this.sessionUID })
            .then(() => {
                this.items = this.items.filter(i => i.Id !== wishlistItemId);
                this.dispatchEvent(new CustomEvent('cartcountchange', {
                    detail: { refresh: true }, bubbles: true, composed: true
                }));
            })
            .catch((err) => {
                this.errorMessage = err?.body?.message || 'Could not add to cart.';
            });
    }
}