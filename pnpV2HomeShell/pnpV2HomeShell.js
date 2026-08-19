import { LightningElement, track } from 'lwc';
import getCartCount from '@salesforce/apex/CartController.getCartCount';
import { getSessionUID } from 'c/sessionService';

export default class PnpV2HomeShell extends LightningElement {
    @track currentView       = 'home';
    @track isCartOpen        = false;
    @track cartCount         = 0;
    @track selectedFamily    = 'all';
    @track selectedSubFamily = '';
    @track searchKey         = '';
    @track selectedProductId = null;

    sessionUID = getSessionUID();
    _hashHandler = null;
    _suppressHashSync = false;

    connectedCallback() {
        this.refreshCartCount();
        // Hash routing: deep-linkable views that survive refresh and back/forward
        this._hashHandler = () => this._applyHash();
        window.addEventListener('hashchange', this._hashHandler);
        this._applyHash();
    }

    disconnectedCallback() {
        if (this._hashHandler) window.removeEventListener('hashchange', this._hashHandler);
    }

    // ── Hash routing ──────────────────────────────────────────────────────────
    // #/               home            #/products/<family>[/<sub>]
    // #/product/<id>   detail          #/cart  #/checkout  #/login
    // #/account        member dash     #/about  #/terms  #/privacy
    // #/search/<term>  search results

    _applyHash() {
        if (this._suppressHashSync) { this._suppressHashSync = false; return; }
        const raw = (window.location.hash || '').replace(/^#\/?/, '');
        const parts = raw.split('/').map(decodeURIComponent);
        const route = parts[0] || '';

        switch (route) {
            case '':
                this.currentView = 'home';
                break;
            case 'products':
                this.selectedFamily    = parts[1] || 'all';
                this.selectedSubFamily = parts[2] || '';
                this.searchKey         = '';
                this.currentView       = 'products';
                break;
            case 'product':
                if (parts[1]) {
                    this.selectedProductId = parts[1];
                    this.currentView = 'productDetail';
                }
                break;
            case 'search':
                this.searchKey      = parts[1] || '';
                this.selectedFamily = 'all';
                this.currentView    = 'products';
                break;
            case 'cart':      this.currentView = 'cart';       break;
            case 'checkout':  this.currentView = 'checkout';   break;
            case 'login':     this.currentView = 'login';      break;
            case 'account':   this.currentView = 'memberCard'; break;
            case 'about':     this.currentView = 'aboutUs';    break;
            case 'terms':     this.currentView = 'terms';      break;
            case 'privacy':   this.currentView = 'privacy';    break;
            default: break;
        }
        this.isCartOpen = false;
    }

    _syncHash() {
        let hash = '#/';
        switch (this.currentView) {
            case 'products':
                hash = this.searchKey
                    ? '#/search/' + encodeURIComponent(this.searchKey)
                    : '#/products/' + encodeURIComponent(this.selectedFamily || 'all')
                        + (this.selectedSubFamily ? '/' + encodeURIComponent(this.selectedSubFamily) : '');
                break;
            case 'productDetail': hash = '#/product/' + this.selectedProductId; break;
            case 'cart':          hash = '#/cart';     break;
            case 'checkout':      hash = '#/checkout'; break;
            case 'login':         hash = '#/login';    break;
            case 'memberCard':    hash = '#/account';  break;
            case 'aboutUs':       hash = '#/about';    break;
            case 'terms':         hash = '#/terms';    break;
            case 'privacy':       hash = '#/privacy';  break;
            default: break;
        }
        if (window.location.hash !== hash) {
            this._suppressHashSync = true; // our own write — don't re-apply
            window.location.hash = hash;
        }
    }

    // ── View getters ──────────────────────────────────────────────────────────

    // Banner only shows on the home landing — not when browsing a category/search
    get showHomeBanner() {
        return this.currentView === 'home';
    }

    // Product grid shows when browsing categories or searching, but NOT on home
    // (home has its own curated sections in the banner)
    get showProducts() {
        return this.currentView === 'products';
    }

    get showProductDetail() {
        return this.currentView === 'productDetail';
    }

    get showCart() {
        return this.currentView === 'cart';
    }

    get showCheckout() {
        return this.currentView === 'checkout';
    }

    get showLogin() {
        return this.currentView === 'login';
    }

    get showMemberCard() {
        return this.currentView === 'memberCard';
    }

    get showAboutUs() {
        return this.currentView === 'aboutUs';
    }

    get showTerms() {
        return this.currentView === 'terms';
    }

    get showPrivacy() {
        return this.currentView === 'privacy';
    }

    // ── Cart ──────────────────────────────────────────────────────────────────

    refreshCartCount() {
        getCartCount({ uid: this.sessionUID })
            .then((count) => { this.cartCount = count || 0; })
            .catch(() => { this.cartCount = 0; });
    }

    handleToggleCart() {
        this.isCartOpen = !this.isCartOpen;
        if (this.isCartOpen) this.refreshCartCount();
    }

    handleViewCart() {
        this.isCartOpen  = false;
        this.currentView = 'cart';
        this._syncHash();
    }

    // "View cart →" on the mini toast opens the slide-out drawer
    handleToastViewCart() {
        this.isCartOpen = true;
        this.refreshCartCount();
    }

    handleCartCleared() {
        this.cartCount = 0;
    }

    handleCartCountChange(event) {
        if (event.detail?.count !== undefined) {
            this.cartCount = event.detail.count;
        } else if (event.detail?.refresh) {
            this.refreshCartCount();
        }
        // Adds show the mini item toast; the full drawer stays on the cart button
        if (event.detail?.addedItem) {
            const toast = this.template.querySelector('c-pnp-v2-cart-toast');
            if (toast) toast.showItem(event.detail.addedItem);
        } else if (event.detail?.openCart) {
            this.isCartOpen = true;
        }
    }

    // ── Navigation ────────────────────────────────────────────────────────────

    handleViewChange(event) {
        const view = event.detail?.view || 'home';
        this.currentView = view;
        this.isCartOpen  = false;
        if (view === 'home') {
            this.selectedFamily    = 'all';
            this.selectedSubFamily = '';
            this.searchKey         = '';
            this.refreshCartCount();
        }
        this._syncHash();
    }

    handleFamilyChange(event) {
        this.selectedFamily    = event.detail?.family || 'all';
        this.selectedSubFamily = event.detail?.subFamily || '';
        this.searchKey         = '';
        this.currentView       = 'products';
        this.isCartOpen        = false;
        this._syncHash();
    }

    handleSearchChange(event) {
        this.searchKey         = event.detail?.searchKey || '';
        this.selectedFamily    = 'all';
        this.selectedSubFamily = '';
        this.currentView       = 'products';
        this.isCartOpen        = false;
        this._syncHash();
    }

    handleProductSelect(event) {
        const productId = event.detail?.productId;
        if (!productId) return;
        this.selectedProductId = productId;
        this.currentView       = 'productDetail';
        this.isCartOpen        = false;
        this._syncHash();
    }
}