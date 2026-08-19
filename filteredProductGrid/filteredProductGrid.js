import { LightningElement, track, wire, api } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { publish, subscribe, MessageContext } from 'lightning/messageService';
import PRODUCT_CHANNEL from '@salesforce/messageChannel/ProductFilters__c';
import getProductsByFamily from '@salesforce/apex/ProductGridController.getProductsByFamily';
import addToCart from '@salesforce/apex/CartController.addToCart';
import getCartItems from '@salesforce/apex/CartController.getCartItems';
import getCartCount from '@salesforce/apex/CartController.getCartCount';
import { getSessionUID } from 'c/sessionService';

function getPricingMeta(p, fmt) {
    const family = (p.Family || '').toLowerCase();
    const has = v => { const n = Number(v); return Number.isFinite(n) && n > 0; };
    const f   = v => fmt.format(Number(v));

    let formattedRegular = '', formattedMember = '';
    let showOfferRibbon = false, showMemberPrice = false;

    if (family === 'beer') {
        if (has(p.Price_6_Pack_New__c)) {
            formattedRegular = f(p.Price_6_Pack_New__c);
            if (has(p.Members_Price_6_Pack__c) && Number(p.Members_Price_6_Pack__c) < Number(p.Price_6_Pack_New__c)) {
                formattedMember = f(p.Members_Price_6_Pack__c); showOfferRibbon = true; showMemberPrice = true;
            }
        } else if (has(p.Price_Slab_of_24_new__c)) {
            formattedRegular = f(p.Price_Slab_of_24_new__c);
            if (has(p.Members_Price_Slab_of_24__c) && Number(p.Members_Price_Slab_of_24__c) < Number(p.Price_Slab_of_24_new__c)) {
                formattedMember = f(p.Members_Price_Slab_of_24__c); showOfferRibbon = true; showMemberPrice = true;
            }
        } else if (has(p.Price__c)) {
            formattedRegular = f(p.Price__c);
            if (has(p.Members_Price_Individual__c) && Number(p.Members_Price_Individual__c) < Number(p.Price__c)) {
                formattedMember = f(p.Members_Price_Individual__c); showOfferRibbon = true; showMemberPrice = true;
            }
        }
    } else {
        if (has(p.Price__c)) formattedRegular = f(p.Price__c);
        if (has(p.Members_Price_Individual__c) && Number(p.Members_Price_Individual__c) < Number(p.Price__c)) {
            formattedMember = f(p.Members_Price_Individual__c); showOfferRibbon = true; showMemberPrice = true;
        }
    }

    return { formattedRegular, formattedMember, _showOfferRibbon: showOfferRibbon, _showMemberPrice: showMemberPrice };
}

export default class FilteredProductGrid extends NavigationMixin(LightningElement) {
    @api selectedFamily = '';
    @track products = [];
    @track selectedSubFamily = '';
    @track searchKey = '';
    @track isLoading = false;
    @track showCartPopup = false;
    @track cartItems = [];
    @track cartCount = 0;
    @track lastAddedProduct = null;
    _subscription = null;
    sessionUID;

    @wire(MessageContext) messageContext;

    connectedCallback() {
        this.sessionUID = getSessionUID();
        this._subscription = subscribe(this.messageContext, PRODUCT_CHANNEL, (message) => {
            if (message.searchKey !== undefined) this.searchKey = message.searchKey;
            if (message.subFamily !== undefined) this.selectedSubFamily = message.subFamily;
        });
    }

    @wire(getProductsByFamily, {
        family: '$selectedFamily',
        subFamily: '$selectedSubFamily',
        searchKey: '$searchKey'
    })
    wiredProducts({ data, error }) {
        if (data) {
            const fmt = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });
            this.products = data.map(p => ({ ...p, ...getPricingMeta(p, fmt) }));
        } else if (error) {
            console.error(error);
        }
    }

    get hasProducts() { return this.products && this.products.length > 0; }

    handleAddToCart = (event) => {
        event.stopPropagation();
        const productId = event.target.dataset.id;
        const product   = this.products.find(p => p.Id === productId);

        addToCart({ productId, uid: this.sessionUID, selectedFormat: 'single' })
            .then(() => {
                this.lastAddedProduct = product;
                return getCartItems({ uid: this.sessionUID });
            })
            .then(cartData => {
                this.cartItems = cartData;
                this.showCartPopup = true;
                return getCartCount({ uid: this.sessionUID });
            })
            .then(count => {
                this.cartCount = count;
                publish(this.messageContext, PRODUCT_CHANNEL, { cartCount: count });
                setTimeout(() => { this.showCartPopup = false; }, 5000);
            })
            .catch(error => {
                this.dispatchEvent(new ShowToastEvent({
                    title: 'Could not add to cart',
                    message: error.body ? error.body.message : 'An error occurred.',
                    variant: 'error'
                }));
            });
    };

    handleNavigate = (event) => {
        const productId = event.currentTarget.dataset.id;
        this[NavigationMixin.Navigate]({
            type: 'standard__webPage',
            attributes: { url: '/product-detail?productId=' + productId }
        });
    };

    handleClosePopup() { this.showCartPopup = false; }

    handleViewCart() {
        this.showCartPopup = false;
        this[NavigationMixin.Navigate]({
            type: 'standard__webPage',
            attributes: { url: '/cart' }
        });
    }
}