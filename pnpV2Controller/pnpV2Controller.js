import { LightningElement } from 'lwc';
import getCartCount from '@salesforce/apex/CartController.getCartCount';
import bannerUrl from '@salesforce/resourceUrl/PointAndPourOfferBanner';

function getSessionUid() {
    const existing = window.localStorage.getItem('cart_uid');
    if (existing) {
        return existing;
    }
    const created = 'uid-' + Date.now();
    window.localStorage.setItem('cart_uid', created);
    return created;
}

export default class PnpV2Controller extends LightningElement {
    selectedFamily = 'all';
    selectedSubFamily = '';
    searchKey = '';
    cartCount = 0;
    isCartOpen = false;

    sessionUID = getSessionUid();
    promoImageUrl = bannerUrl;

    connectedCallback() {
        this.refreshCartCount();
    }

    refreshCartCount() {
        getCartCount({ uid: this.sessionUID })
            .then((count) => {
                this.cartCount = count || 0;
            })
            .catch(() => {
                this.cartCount = 0;
            });
    }

    handleFamilyChange(event) {
        this.selectedFamily = event.detail.family || 'all';
        this.selectedSubFamily = '';
        this.searchKey = '';
    }

    handleSearchChange(event) {
        this.searchKey = event.detail.searchKey || '';
        this.selectedFamily = 'all';
        this.selectedSubFamily = '';
    }

    handleCartCountChange(event) {
        this.cartCount = event.detail.count || 0;
    }

    handleToggleCart() {
        this.isCartOpen = !this.isCartOpen;
        if (this.isCartOpen) {
            this.refreshCartCount();
        }
    }

    handleProductSelect(event) {
        const productId = event.detail.productId;
        window.location.href = '/product-detail?productId=' + productId;
    }

    handleLoginClick() {
        window.location.href = '/loginpage';
    }
}