import { LightningElement, track, wire } from 'lwc';
import { NavigationMixin, CurrentPageReference } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { publish, MessageContext } from 'lightning/messageService';
import PRODUCT_CHANNEL from '@salesforce/messageChannel/ProductFilters__c';
import getProductsByFamily from '@salesforce/apex/ProductGridController.getProductsByFamily';
import addToCart from '@salesforce/apex/CartController.addToCart';
import getCartCount from '@salesforce/apex/CartController.getCartCount';

// ─── Pricing helper ───────────────────────────────────────────────────────────
function getPricingMeta(p, fmt) {
    const family = (p.Family || '').toLowerCase();
    const has = v => { const n = Number(v); return Number.isFinite(n) && n > 0; };
    const f   = v => fmt.format(Number(v));

    let primaryLabel = 'Price', primaryFormatted = '';
    let secondaryLabel = '', secondaryFormatted = '';
    let showOfferRibbon = false;

    if (family === 'beer') {
        if (has(p.Six_Pack_Price__c)) {
            primaryLabel     = '6 Pack';
            primaryFormatted = f(p.Six_Pack_Price__c);
            if (has(p.Slab_Price__c)) {
                secondaryLabel     = 'Slab';
                secondaryFormatted = f(p.Slab_Price__c);
            } else if (has(p.Members_Price_Six_Pack__c)) {
                secondaryLabel     = '✦ Member 6 Pack';
                secondaryFormatted = f(p.Members_Price_Six_Pack__c);
                showOfferRibbon    = Number(p.Members_Price_Six_Pack__c) < Number(p.Six_Pack_Price__c);
            }
        } else if (has(p.Slab_Price__c)) {
            primaryLabel     = 'Slab';
            primaryFormatted = f(p.Slab_Price__c);
            if (has(p.Members_Price_Slab__c)) {
                secondaryLabel     = '✦ Member Slab';
                secondaryFormatted = f(p.Members_Price_Slab__c);
                showOfferRibbon    = Number(p.Members_Price_Slab__c) < Number(p.Slab_Price__c);
            }
        } else if (has(p.Price__c)) {
            primaryLabel     = 'Price';
            primaryFormatted = f(p.Price__c);
            if (has(p.Members_Price_Individual__c)) {
                secondaryLabel     = '✦ Member Price';
                secondaryFormatted = f(p.Members_Price_Individual__c);
                showOfferRibbon    = Number(p.Members_Price_Individual__c) < Number(p.Price__c);
            }
        }
    } else if (family === 'wine') {
        if (has(p.Price__c)) {
            primaryLabel     = 'Per Bottle';
            primaryFormatted = f(p.Price__c);
        }
        if (has(p.Six_Pack_Price__c)) {
            secondaryLabel     = '6 Bottles';
            secondaryFormatted = f(p.Six_Pack_Price__c);
        } else if (has(p.Members_Price_Individual__c)) {
            secondaryLabel     = '✦ Member Price';
            secondaryFormatted = f(p.Members_Price_Individual__c);
            showOfferRibbon    = Number(p.Members_Price_Individual__c) < Number(p.Price__c);
        }
    } else {
        if (has(p.Price__c)) {
            primaryLabel     = 'Price';
            primaryFormatted = f(p.Price__c);
        }
        if (has(p.Members_Price_Individual__c) &&
            Number(p.Members_Price_Individual__c) < Number(p.Price__c)) {
            secondaryLabel     = '✦ Member Price';
            secondaryFormatted = f(p.Members_Price_Individual__c);
            showOfferRibbon    = true;
        }
    }

    return { primaryPriceLabel: primaryLabel, primaryPriceFormatted: primaryFormatted,
             secondaryPriceLabel: secondaryLabel, secondaryPriceFormatted: secondaryFormatted,
             _showSecondaryPrice: !!secondaryFormatted, _showOfferRibbon: showOfferRibbon };
}
// ─────────────────────────────────────────────────────────────────────────────

export default class SearchResults extends NavigationMixin(LightningElement) {
    @track products = [];
    @track searchKey = '';

    @wire(MessageContext)
    messageContext;

    @wire(CurrentPageReference)
    pageRef(ref) {
        if (ref && ref.state && ref.state.searchKey) {
            this.searchKey = ref.state.searchKey;
        }
    }

    @wire(getProductsByFamily, { family: '', subFamily: '', searchKey: '$searchKey' })
    wiredProducts({ data, error }) {
        if (data) {
            const fmt = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });
            this.products = data.map(p => ({ ...p, ...getPricingMeta(p, fmt) }));
        } else if (error) {
            console.error('Search error:', error);
        }
    }

    get hasProducts() { return this.products && this.products.length > 0; }
    get noResults()   { return this.searchKey && this.products && this.products.length === 0; }
    get resultCount() { return this.products ? this.products.length : 0; }

    handleAddToCart(event) {
        event.stopPropagation();
        const productId = event.target.dataset.id;

        addToCart({ productId })
            .then(() => getCartCount())
            .then(count => {
                publish(this.messageContext, PRODUCT_CHANNEL, { cartCount: count });
                this.dispatchEvent(new ShowToastEvent({
                    title: 'Added to Cart',
                    message: 'Item added to your cart.',
                    variant: 'success'
                }));
            })
            .catch(error => {
                this.dispatchEvent(new ShowToastEvent({
                    title: 'Could not add to cart',
                    message: error.body ? error.body.message : 'An error occurred.',
                    variant: 'error'
                }));
            });
    }

    handleNavigate(event) {
        const productId = event.currentTarget.dataset.id;
        this[NavigationMixin.Navigate]({
            type: 'standard__webPage',
            attributes: { url: '/product-detail?productId=' + productId }
        });
    }
}