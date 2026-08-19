import { LightningElement, wire, track } from 'lwc';
import getProductsByFamily from '@salesforce/apex/ProductGridController.getProductsByFamily';
import addToCart           from '@salesforce/apex/CartController.addToCart';
import getCartCount        from '@salesforce/apex/CartController.getCartCount';
import { getSessionUID }   from 'c/sessionService';
import { fadeUpIn }        from 'c/pnpGsap';

const fmt = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });

function mapProduct(p) {
    const reg = Number(p.Price__c || 0);
    const mem = Number(p.Members_Price_Individual__c || 0);
    const dis = mem > 0 && mem < reg;
    return {
        ...p,
        showMemberPrice:       dis,
        formattedRegularPrice: fmt.format(reg),
        formattedMemberPrice:  fmt.format(mem)
    };
}

export default class PnpV2HomeBanner extends LightningElement {
    @track newProducts  = [];
    @track memberOffers = [];
    sessionUID = getSessionUID();

    renderedCallback() {
        // Once-per-element entrance animations (guarded inside the helper)
        fadeUpIn(this, '.hero-tag, .hero-heading, .hero-sub, .hero-btns', { stagger: 0.1 });
        fadeUpIn(this, '.product-card', { stagger: 0.06, delay: 0.1 });
    }

    // Pulls first 6 products across all categories as "new arrivals"
    // Swap family: 'new' and add Is_New__c field later when you're ready
    @wire(getProductsByFamily, { family: 'all', subFamily: '', searchKey: '' })
    wiredAll({ data, error }) {
        if (data) {
            this.newProducts = data.slice(0, 6).map(mapProduct);
        } else if (error) {
            console.error('homeBanner wiredAll error', error);
        }
    }

    // Pulls member offers — same query your grid uses for the offers tab
    @wire(getProductsByFamily, { family: 'offers', subFamily: '', searchKey: '' })
    wiredOffers({ data, error }) {
        if (data) {
            this.memberOffers = data.slice(0, 6).map(mapProduct);
        } else if (error) {
            console.error('homeBanner wiredOffers error', error);
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    _dispatchFamily(family) {
        this.dispatchEvent(new CustomEvent('familychange', {
            bubbles: true, composed: true, detail: { family }
        }));
    }

    _dispatchView(view) {
        this.dispatchEvent(new CustomEvent('viewchange', {
            bubbles: true, composed: true, detail: { view }
        }));
    }

    // ── Nav ───────────────────────────────────────────────────────────────────

    handleJoin()        { this._dispatchView('login');    }
    handleBrowse()      { this._dispatchFamily('all');    }
    handleOffersClick() { this._dispatchFamily('offers'); }
    handleCatBeer()     { this._dispatchFamily('Beer');   }
    handleCatWine()     { this._dispatchFamily('Wine');   }
    handleCatSpirits()  { this._dispatchFamily('Spirits'); }
    handleCatRtd()      { this._dispatchFamily('RTD');    }

    // Clicking a card opens product detail — same as the main grid
    handleCardClick(event) {
        if (event.target.classList.contains('add-btn')) return;
        const productId = event.currentTarget.dataset.id;
        if (!productId) return;
        this.dispatchEvent(new CustomEvent('productselect', {
            bubbles: true, composed: true, detail: { productId }
        }));
    }

    // Add to cart — same Apex calls as your product grid
    handleAddToCart(event) {
        event.stopPropagation();
        const productId = event.currentTarget.dataset.id;
        addToCart({ productId, uid: this.sessionUID, selectedFormat: 'single' })
            .then(() => getCartCount({ uid: this.sessionUID }))
            .then((count) => {
                this.dispatchEvent(new CustomEvent('cartcountchange', {
                    bubbles: true, composed: true, detail: { count }
                }));
            })
            .catch((err) => { console.error(err?.body?.message || err); });
    }
}