import { LightningElement, api, track } from 'lwc';
import isGuestUser from '@salesforce/user/isGuest';
import logoUrl from '@salesforce/resourceUrl/pointnpourlogo';
import getProductsByFamily from '@salesforce/apex/ProductGridController.getProductsByFamily';

const NAV_ITEMS = [
    {
        id: 'Beer', label: 'Beer', family: 'Beer',
        subs: ['IPA', 'Lager', 'Stout', 'Pale Ale', 'Wheat Beer', 'Sour', 'Porter']
    },
    {
        id: 'Wine', label: 'Wines', family: 'Wine',
        subs: ['Red Wine', 'White Wine', 'Rosé', 'Sparkling', 'Dessert Wine']
    },
    {
        id: 'Spirits', label: 'Spirits', family: 'Spirits',
        subs: ['Whisky', 'Vodka', 'Gin', 'Rum', 'Tequila', 'Brandy']
    },
    {
        id: 'RTD', label: 'RTD', family: 'RTD',
        subs: ['Hard Seltzer', 'Cocktails', 'Cider', 'Pre-mixed']
    },
    {
        id: 'offers', label: 'Offers', family: 'offers',
        subs: []
    }
];

export default class PnpV2Header extends LightningElement {
    @api cartCount      = 0;
    @api selectedFamily = 'all';

    @track searchKey           = '';
    @track searchSuggestions   = [];
    @track showDropdown        = false;
    @track _activeNavId        = null;

    logoSrc      = logoUrl;
    _searchTimer = null;
    _leaveTimer  = null;

    get isGuestUser() { return isGuestUser; }
    get isLoggedIn()  { return !isGuestUser; }
    get cartLabel()   { return this.cartCount > 0 ? `Cart (${this.cartCount})` : 'Cart'; }

    get navItems() {
        return NAV_ITEMS.map(item => ({
            ...item,
            btnClass: this.selectedFamily === item.id ? 'nav-link active' : 'nav-link'
        }));
    }

    get showMegaMenu() {
        const nav = NAV_ITEMS.find(n => n.id === this._activeNavId);
        return !!(nav && nav.subs.length > 0);
    }

    get activeMegaFamily() {
        return NAV_ITEMS.find(n => n.id === this._activeNavId)?.family || '';
    }

    get activeMegaLabel() {
        return NAV_ITEMS.find(n => n.id === this._activeNavId)?.label || '';
    }

    get activeNavSubs() {
        const nav = NAV_ITEMS.find(n => n.id === this._activeNavId);
        return nav ? nav.subs.map(s => ({ label: s, value: s })) : [];
    }

    // ── Events ────────────────────────────────────────────────────────────────

    _view(view) {
        this.dispatchEvent(new CustomEvent('viewchange', { detail: { view }, bubbles: true, composed: true }));
    }

    _family(family, subFamily) {
        this.dispatchEvent(new CustomEvent('familychange', {
            detail: { family, subFamily: subFamily || '' }, bubbles: true, composed: true
        }));
    }

    // ── Nav handlers ──────────────────────────────────────────────────────────

    handleHomeClick() { this._view('home'); }

    handleNavHover(event) {
        clearTimeout(this._leaveTimer);
        this._activeNavId = event.currentTarget.dataset.nav;
    }

    handleNavLeave() {
        this._leaveTimer = setTimeout(() => { this._activeNavId = null; }, 140);
    }

    handleMegaEnter() {
        clearTimeout(this._leaveTimer);
    }

    handleNavClick(event) {
        const family = event.currentTarget.dataset.family;
        this._activeNavId = null;
        clearTimeout(this._leaveTimer);
        this._view('products');
        this._family(family, '');
        this.showDropdown = false;
    }

    handleSubNavClick(event) {
        event.stopPropagation();
        const family = event.currentTarget.dataset.family;
        const sub    = event.currentTarget.dataset.sub;
        this._activeNavId = null;
        clearTimeout(this._leaveTimer);
        this._view('products');
        this._family(family, sub);
        this.showDropdown = false;
    }

    handleCartClick() {
        this.dispatchEvent(new CustomEvent('togglecart', { bubbles: true, composed: true }));
    }

    handleLoginOrMemberClick() {
        this._view(this.isLoggedIn ? 'memberCard' : 'login');
    }

    // ── Search ────────────────────────────────────────────────────────────────

    handleSearchInput(event) {
        this.searchKey = event.target.value;
        const term = (event.target.value || '').trim();

        clearTimeout(this._searchTimer);

        if (term.length < 2) {
            this.searchSuggestions = [];
            this.showDropdown = false;
            return;
        }

        this._searchTimer = setTimeout(() => {
            getProductsByFamily({ family: 'all', subFamily: '', searchKey: term })
                .then(products => {
                    this.searchSuggestions = (products || []).slice(0, 8).map(p => ({
                        Id:    p.Id,
                        Name:  p.Name,
                        price: p.Price__c ? '$' + Number(p.Price__c).toFixed(2) : '',
                        image: p.Product_Image_Field__c || ''
                    }));
                    this.showDropdown = this.searchSuggestions.length > 0;
                })
                .catch(() => {
                    this.searchSuggestions = [];
                    this.showDropdown = false;
                });
        }, 300);
    }

    handleSearchKeyUp(event) {
        if (event.key === 'Enter') {
            this.closeDropdown();
            this.handleSearchSubmit();
        }
        if (event.key === 'Escape') {
            this.closeDropdown();
        }
    }

    handleSearchSubmit() {
        const clean = (this.searchKey || '').trim();
        this.closeDropdown();
        this.dispatchEvent(new CustomEvent('searchchange', { detail: { searchKey: clean }, bubbles: true, composed: true }));
        this._view('products');
    }

    handleSuggestionClick(event) {
        const productId = event.currentTarget.dataset.id;
        this.closeDropdown();
        this.searchKey = '';
        this.dispatchEvent(new CustomEvent('productselect', {
            detail: { productId }, bubbles: true, composed: true
        }));
    }

    handleSearchBlur() {
        // Delay so click on suggestion fires first
        setTimeout(() => { this.closeDropdown(); }, 200);
    }

    closeDropdown() {
        this.showDropdown = false;
        this.searchSuggestions = [];
    }
}