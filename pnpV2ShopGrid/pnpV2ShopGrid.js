import { LightningElement, api, wire, track } from 'lwc';
import getProductsByFamily from '@salesforce/apex/ProductGridController.getProductsByFamily';
import addToCart           from '@salesforce/apex/CartController.addToCart';
import getCartCount        from '@salesforce/apex/CartController.getCartCount';
import { getSessionUID }   from 'c/sessionService';

export default class PnpV2ShopGrid extends LightningElement {
    @api selectedFamily    = 'all';
    @api selectedSubFamily = '';
    @api searchKey         = '';
    @api showHeading       = false;
    @track products = [];
    sessionUID = getSessionUID();

    @wire(getProductsByFamily, { family: '$selectedFamily', subFamily: '$selectedSubFamily', searchKey: '$searchKey' })
    wiredProducts({ data, error }) {
        if (data) {
            const fmt = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });
            this.products = data.map((p) => {
                const reg = Number(p.Price__c || 0);
                const mem = Number(p.Members_Price_Individual__c || 0);
                const dis = mem > 0 && mem < reg;
                return {
                    ...p,
                    showMemberPrice:       dis,
                    showOfferBadge:        this.selectedFamily === 'offers' || dis,
                    formattedRegularPrice: fmt.format(reg),
                    formattedMemberPrice:  fmt.format(mem)
                };
            });
        } else if (error) { this.products = []; console.error(error); }
    }

    get hasProducts() { return this.products && this.products.length > 0; }
    get sectionTitle() {
        if (this.selectedFamily === 'offers') return "This Week's Offers";
        if (this.selectedFamily && this.selectedFamily !== 'all') return this.selectedFamily;
        if (this.searchKey) return 'Search Results';
        return 'All Products';
    }

    handleCardClick(event) {
        if (event.target.classList.contains('add-btn')) return;
        this.dispatchEvent(new CustomEvent('productselect', {
            detail: { productId: event.currentTarget.dataset.id }, bubbles: true, composed: true
        }));
    }

    handleAddToCart(event) {
        event.stopPropagation();
        const productId = event.currentTarget.dataset.id;
        addToCart({ productId, uid: this.sessionUID, selectedFormat: 'single' })
            .then(() => getCartCount({ uid: this.sessionUID }))
            .then((count) => {
                this.dispatchEvent(new CustomEvent('cartcountchange', { detail: { count }, bubbles: true, composed: true }));
            })
            .catch((error) => { console.error(error?.body?.message || error); });
    }
}