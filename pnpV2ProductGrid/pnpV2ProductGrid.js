import { LightningElement, track, wire, api } from 'lwc';
import { subscribe, MessageContext } from 'lightning/messageService';
import PRODUCT_CHANNEL from '@salesforce/messageChannel/ProductFilters__c';
import getProductsByFamily from '@salesforce/apex/ProductGridController.getProductsByFamily';
import addToCart from '@salesforce/apex/CartController.addToCart';
import { getSessionUID } from 'c/sessionService';
import { trackEvent } from 'c/funnelTracker';
import { fadeUpIn } from 'c/pnpGsap';

const PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 140 160' width='140' height='160'%3E%3Crect width='140' height='160' fill='%23f5f3ff'/%3E%3Crect x='55' y='28' width='30' height='8' rx='4' fill='%23c4b5fd'/%3E%3Crect x='52' y='36' width='36' height='6' rx='2' fill='%23a78bfa'/%3E%3Cellipse cx='70' cy='100' rx='22' ry='36' fill='%23c4b5fd'/%3E%3Cellipse cx='70' cy='100' rx='14' ry='28' fill='%23a78bfa'/%3E%3Ctext x='70' y='148' text-anchor='middle' fill='%237c3aed' font-size='9' font-family='sans-serif'%3ENo Image%3C/text%3E%3C/svg%3E";
const fmt = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });

export default class PnpV2ProductGrid extends LightningElement {
    renderedCallback() {
        // Stagger-in newly rendered product cards (helper skips ones already animated)
        fadeUpIn(this, '.product-card', { stagger: 0.05 });
    }

    // Parent-driven @api props feed the wire adapter
    @track _selectedFamily = '';
    @track _selectedSubFamily = '';
    @track _searchKey = '';

    @api
    get selectedFamily() { return this._selectedFamily; }
    set selectedFamily(v) {
        this._selectedFamily = v || '';
        this._filterSubFamilies  = [];
        this._priceMin           = null;
        this._priceMax           = null;
        this._sortOrder          = 'az';
        this._inStockOnly        = false;
        this._memberOffersOnly   = false;
        this._has6Pack           = false;
        this._hasSlab            = false;
    }

    @api
    get selectedSubFamily() { return this._selectedSubFamily; }
    set selectedSubFamily(v) { this._selectedSubFamily = v || ''; }

    @api
    get searchKey() { return this._searchKey; }
    set searchKey(v) { this._searchKey = v || ''; }

    // Raw products from Apex
    @track _rawProducts = [];

    // Sidebar filter state
    @track _filterSubFamilies = [];
    @track _sortOrder         = 'az';
    @track _priceMin          = null;
    @track _priceMax          = null;
    @track _inStockOnly       = false;
    @track _memberOffersOnly  = false;
    @track _has6Pack          = false;
    @track _hasSlab           = false;
    @track _sidebarOpen       = false;

    sessionUID = getSessionUID();
    _subscription = null;

    @wire(MessageContext)
    messageContext;

    connectedCallback() {
        this._subscription = subscribe(this.messageContext, PRODUCT_CHANNEL, (message) => {
            if (message.searchKey !== undefined) this._searchKey = message.searchKey;
            if (message.subFamily !== undefined) this._selectedSubFamily = message.subFamily;
        });
    }

    @wire(getProductsByFamily, {
        family: '$_selectedFamily',
        subFamily: '$_selectedSubFamily',
        searchKey: '$_searchKey'
    })
    wiredProducts({ data, error }) {
        if (data) {
            this._rawProducts = data.map(p => {
                const reg = Number(p.Price__c);
                const mem = Number(p.Members_Price_Individual__c);
                const hasReg = Number.isFinite(reg) && reg > 0;
                const hasMem = Number.isFinite(mem) && mem > 0;
                return {
                    ...p,
                    formattedRegularPrice: hasReg ? fmt.format(reg) : '',
                    formattedMemberPrice:  hasMem ? fmt.format(mem) : '',
                    showMemberPrice:  hasMem && (!hasReg || mem !== reg),
                    showOfferBadge:   hasReg && hasMem && mem < reg,
                    imageUrl: p.Product_Image_Field__c || PLACEHOLDER
                };
            });
        } else if (error) {
            console.error(error);
            this._rawProducts = [];
        }
    }

    // ── Sidebar computed properties ───────────────────────────────────────────

    get availableSubFamilies() {
        const seen = new Set();
        const options = [];
        (this._rawProducts || []).forEach(p => {
            if (p.Product_Sub_Family__c && !seen.has(p.Product_Sub_Family__c)) {
                seen.add(p.Product_Sub_Family__c);
                options.push({
                    label: p.Product_Sub_Family__c,
                    value: p.Product_Sub_Family__c,
                    checked: this._filterSubFamilies.includes(p.Product_Sub_Family__c)
                });
            }
        });
        return options;
    }

    get hasSidebarSubFamilies() {
        return this.availableSubFamilies.length > 0;
    }

    get displayProducts() {
        let result = [...(this._rawProducts || [])];

        if (this._filterSubFamilies.length > 0) {
            result = result.filter(p => this._filterSubFamilies.includes(p.Product_Sub_Family__c));
        }
        if (this._priceMin != null) {
            result = result.filter(p => Number(p.Price__c) >= this._priceMin);
        }
        if (this._priceMax != null) {
            result = result.filter(p => Number(p.Price__c) <= this._priceMax);
        }
        if (this._inStockOnly) {
            result = result.filter(p => p.Quantity_on_Hand__c == null || Number(p.Quantity_on_Hand__c) > 0);
        }
        if (this._memberOffersOnly) {
            result = result.filter(p => p.showOfferBadge);
        }
        if (this._has6Pack) {
            result = result.filter(p => p.Price_6_Pack_New__c && Number(p.Price_6_Pack_New__c) > 0);
        }
        if (this._hasSlab) {
            result = result.filter(p => p.Price_Slab_of_24_new__c && Number(p.Price_Slab_of_24_new__c) > 0);
        }

        result.sort((a, b) => {
            if (this._sortOrder === 'price-asc')  return Number(a.Price__c) - Number(b.Price__c);
            if (this._sortOrder === 'price-desc') return Number(b.Price__c) - Number(a.Price__c);
            if (this._sortOrder === 'newest')     return new Date(b.CreatedDate) - new Date(a.CreatedDate);
            return (a.Name || '').localeCompare(b.Name || '');
        });

        return result;
    }

    // Expose boolean filter state to template (LWC templates can't read @track _ properties directly)
    get inStockOnly()      { return this._inStockOnly; }
    get memberOffersOnly() { return this._memberOffersOnly; }
    get filterHas6Pack()   { return this._has6Pack; }
    get filterHasSlab()    { return this._hasSlab; }

    get hasProducts() {
        return this.displayProducts.length > 0;
    }

    get showHeading() {
        return !!this._selectedFamily && this._selectedFamily !== 'all';
    }

    get sectionTitle() {
        if (!this._selectedFamily || this._selectedFamily === 'all') return '';
        if (this._selectedFamily === 'offers') return 'Member Offers';
        return this._selectedFamily;
    }

    get sidebarClass() {
        return this._sidebarOpen ? 'sidebar sidebar--open' : 'sidebar';
    }

    get toggleSidebarLabel() {
        return this._sidebarOpen ? 'Hide Filters' : 'Show Filters';
    }

    get hasActiveFilters() {
        return this._filterSubFamilies.length > 0
            || this._priceMin != null
            || this._priceMax != null
            || this._inStockOnly
            || this._memberOffersOnly
            || this._has6Pack
            || this._hasSlab;
    }

    // ── Sidebar handlers ──────────────────────────────────────────────────────

    handleToggleSidebar() {
        this._sidebarOpen = !this._sidebarOpen;
    }

    handleSubFamilyFilter(event) {
        const sub = event.target.dataset.sub;
        if (event.target.checked) {
            this._filterSubFamilies = [...this._filterSubFamilies, sub];
        } else {
            this._filterSubFamilies = this._filterSubFamilies.filter(s => s !== sub);
        }
    }

    handleSortChange(event) {
        this._sortOrder = event.target.value;
    }

    handlePriceMinChange(event) {
        const v = event.target.value;
        this._priceMin = v !== '' ? Number(v) : null;
    }

    handlePriceMaxChange(event) {
        const v = event.target.value;
        this._priceMax = v !== '' ? Number(v) : null;
    }

    handleClearFilters() {
        this._filterSubFamilies = [];
        this._priceMin          = null;
        this._priceMax          = null;
        this._sortOrder         = 'az';
        this._inStockOnly       = false;
        this._memberOffersOnly  = false;
        this._has6Pack          = false;
        this._hasSlab           = false;
        const minInput = this.template.querySelector('.price-min');
        const maxInput = this.template.querySelector('.price-max');
        if (minInput) minInput.value = '';
        if (maxInput) maxInput.value = '';
    }

    handleInStockToggle(event)      { this._inStockOnly      = event.target.checked; }
    handleMemberOffersToggle(event) { this._memberOffersOnly = event.target.checked; }
    handle6PackToggle(event)        { this._has6Pack         = event.target.checked; }
    handleSlabToggle(event)         { this._hasSlab          = event.target.checked; }

    // ── Product card handlers ─────────────────────────────────────────────────

    handleCardClick(event) {
        if (event.target.classList.contains('add-btn')) return;
        const card = event.currentTarget;
        const productId = card.dataset.id;
        this.dispatchEvent(new CustomEvent('productselect', {
            detail: { productId }, bubbles: true, composed: true
        }));
    }

    handleAddToCart(event) {
        event.stopPropagation();
        const productId = event.target.dataset.id;

        addToCart({ productId, uid: this.sessionUID, selectedFormat: 'single' })
            .then(() => {
                const product = this._rawProducts.find(p => p.Id === productId);
                trackEvent('Add_to_Cart', productId, {
                    quantity: 1,
                    unitPrice: product?.Price__c
                });
                this.dispatchEvent(new CustomEvent('cartcountchange', {
                    detail: {
                        refresh: true,
                        addedItem: {
                            name: product?.Name || 'Item',
                            image: product?.imageUrl,
                            qty: 1,
                            priceLabel: product?.showMemberPrice
                                ? product.formattedMemberPrice
                                : product?.formattedRegularPrice
                        }
                    },
                    bubbles: true,
                    composed: true
                }));
            })
            .catch(err => {
                console.error('Add to cart failed:', err);
            });
    }

    handleImageError(event) {
        event.target.src = PLACEHOLDER;
    }
}