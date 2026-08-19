import { LightningElement, track } from 'lwc';
import getCartItems   from '@salesforce/apex/CartController.getCartItems';
import updateQuantity from '@salesforce/apex/CartController.updateQuantity';
import removeFromCart from '@salesforce/apex/CartController.removeFromCart';
import clearCart      from '@salesforce/apex/CartController.clearCart';
import { getSessionUID } from 'c/sessionService';

const QTY_SYNC_DELAY_MS = 400;
const UNTRACKED_MAX_QTY = 999;

function resolveActivePrice(item) {
    const family = (item.ProductFamily || '').toLowerCase();
    const fmt    = (item.SelectedFormat || '').toLowerCase();
    const has    = v => { const n = Number(v); return Number.isFinite(n) && n > 0; };
    const isMem  = item.IsMember;

    if (family === 'beer') {
        if (fmt.includes('slab')) {
            if (isMem && has(item.MemberSlabPrice)) return Number(item.MemberSlabPrice);
            if (has(item.SlabPrice)) return Number(item.SlabPrice);
        }
        if (fmt.includes('six') || fmt.includes('6') || fmt.includes('pack')) {
            if (isMem && has(item.MemberSixPackPrice)) return Number(item.MemberSixPackPrice);
            if (has(item.SixPackPrice)) return Number(item.SixPackPrice);
        }
    }
    if (isMem && has(item.MemberPrice)) return Number(item.MemberPrice);
    return Number(item.RegularPrice) || 0;
}

// Best price for a pack (member price wins when it applies), or 0 if unavailable
function resolvePackPrice(memberVal, regularVal, isMem) {
    const has = v => { const n = Number(v); return Number.isFinite(n) && n > 0; };
    if (isMem && has(memberVal)) return Number(memberVal);
    return has(regularVal) ? Number(regularVal) : 0;
}

// Line total with automatic pack conversion: singles of a beer are bundled
// into slabs of 24 and 6-packs whenever that works out cheaper.
// e.g. qty 6 → one 6-pack price, qty 24 → one slab price, qty 31 → slab + 6-pack + 1 single.
function computeLineTotal(item, isMem) {
    const qty      = Number(item.Quantity) || 0;
    const unit     = resolveActivePrice({ ...item, IsMember: isMem });
    const straight = unit * qty;

    const family = (item.ProductFamily || '').toLowerCase();
    const fmt    = (item.SelectedFormat || 'single').toLowerCase();
    if (family !== 'beer' || fmt !== 'single') {
        return { total: straight, note: '' };
    }

    const sixPrice  = resolvePackPrice(item.MemberSixPackPrice, item.SixPackPrice, isMem);
    const slabPrice = resolvePackPrice(item.MemberSlabPrice,    item.SlabPrice,    isMem);

    let remaining = Math.floor(qty);
    let total     = 0;
    let slabs     = 0;
    let sixes     = 0;
    if (slabPrice > 0 && slabPrice < unit * 24) {
        slabs      = Math.floor(remaining / 24);
        total     += slabs * slabPrice;
        remaining %= 24;
    }
    if (sixPrice > 0 && sixPrice < unit * 6) {
        sixes      = Math.floor(remaining / 6);
        total     += sixes * sixPrice;
        remaining %= 6;
    }
    total += remaining * unit;

    if (total >= straight || (!slabs && !sixes)) return { total: straight, note: '' };

    const parts = [];
    if (slabs)     parts.push(`${slabs} × slab of 24`);
    if (sixes)     parts.push(`${sixes} × 6-pack`);
    if (remaining) parts.push(`${remaining} × single`);
    return { total, note: `Pack pricing applied: ${parts.join(' + ')}` };
}

export default class Cart extends LightningElement {
    @track cartItems = [];
    @track isLoading = true;
    @track qtyMessage = '';

    sessionUID = getSessionUID();
    _syncTimers = {};       // per-item debounce timers for quantity sync
    _pendingQty = {};       // per-item quantity awaiting server sync
    _qtyMessageTimer = null;

    connectedCallback() {
        this.loadCart();
    }

    disconnectedCallback() {
        this._flushPendingSyncs(); // persist any unsent quantity edits
        clearTimeout(this._qtyMessageTimer);
        clearTimeout(this._confirmClearTimer);
    }

    loadCart() {
        this.isLoading = true;
        getCartItems({ uid: this.sessionUID })
            .then(data => {
                this.cartItems = data.map(item => this._decorate(item));
                this.isLoading = false;
            })
            .catch(error => {
                console.error('Cart load error:', error);
                this.isLoading = false;
            });
    }

    _decorate(item) {
        const fmt         = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });
        const activePrice = resolveActivePrice(item);
        const qty         = Number(item.Quantity) || 0;
        const stock       = Number(item.QuantityOnHand);
        const hasStock    = Number.isFinite(stock);
        const maxQty      = hasStock ? Math.max(stock, 0) : UNTRACKED_MAX_QTY;
        const priced      = computeLineTotal(item, item.IsMember);
        const lineTotal   = priced.total;
        const fullReg     = Number(item.RegularPrice) || 0;
        const memberP     = Number(item.MemberPrice)  || 0;
        const savings     = item.IsMember
            ? Math.max(computeLineTotal(item, false).total - lineTotal, 0) : 0;

        return {
            ...item,
            _qty:               qty,
            _maxQty:            maxQty,
            _atMaxQty:          qty >= maxQty,
            formattedActivePrice: activePrice ? fmt.format(activePrice) : '',
            formattedRegular:   fmt.format(fullReg),
            formattedMember:    item.IsMember && memberP ? fmt.format(memberP) : '',
            _showMemberPrice:   item.IsMember && memberP > 0 && memberP < fullReg,
            formattedLineTotal: fmt.format(lineTotal),
            formattedSavings:   savings > 0 ? fmt.format(savings) : '',
            _packNote:          priced.note,
            _lineTotal:         lineTotal,
            _savings:           savings,
            _isLowStock:        hasStock && stock > 0 && stock <= 5,
            _isOutOfStock:      hasStock && stock === 0
        };
    }

    get hasItems()        { return this.cartItems && this.cartItems.length > 0; }
    get subtotal()        { return this.cartItems.reduce((s, i) => s + i._lineTotal, 0); }
    get totalSavings()    { return this.cartItems.reduce((s, i) => s + i._savings, 0); }
    get hasMemberSavings(){ return this.totalSavings > 0; }

    _fmt(v) { return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(v); }
    get formattedSubtotal()    { return this._fmt(this.subtotal); }
    get formattedTotalSavings(){ return this._fmt(this.totalSavings); }
    get formattedTotal()       { return this._fmt(this.subtotal); }

    // ── Quantity handling ─────────────────────────────────────────────────────
    // Updates apply locally first (instant UI), then sync to the server on a
    // short debounce so rapid +/- clicks collapse into one Apex call.

    handleIncrease(event) {
        const item = this.cartItems.find(i => i.Id === event.target.dataset.id);
        if (!item) return;
        this._setQuantity(item, item._qty + 1);
    }

    handleDecrease(event) {
        const item = this.cartItems.find(i => i.Id === event.target.dataset.id);
        if (!item) return;
        if (item._qty <= 1) {
            this._removeItem(item.Id);
        } else {
            this._setQuantity(item, item._qty - 1);
        }
    }

    handleQtyChange(event) {
        const item = this.cartItems.find(i => i.Id === event.target.dataset.id);
        if (!item) return;
        let qty = parseInt(event.target.value, 10);
        if (!Number.isFinite(qty) || qty < 1) qty = 1;
        this._setQuantity(item, qty);
        // reflect the clamped value back into the input
        event.target.value = String(Math.min(qty, item._maxQty));
    }

    _setQuantity(item, requestedQty) {
        let qty = requestedQty;
        if (qty > item._maxQty) {
            qty = item._maxQty;
            this._showQtyMessage(`Only ${item._maxQty} of ${item.ProductName} in stock.`);
        }
        if (qty < 1 || qty === item._qty) return;

        this.cartItems = this.cartItems.map(i =>
            i.Id === item.Id ? this._decorate({ ...i, Quantity: qty }) : i
        );

        this._pendingQty[item.Id] = qty;
        clearTimeout(this._syncTimers[item.Id]);
        this._syncTimers[item.Id] = setTimeout(() => this._syncItem(item.Id), QTY_SYNC_DELAY_MS);
    }

    _syncItem(itemId) {
        clearTimeout(this._syncTimers[itemId]);
        delete this._syncTimers[itemId];
        const qty = this._pendingQty[itemId];
        delete this._pendingQty[itemId];
        if (qty === undefined) return Promise.resolve();
        return updateQuantity({ cartItemId: itemId, newQuantity: qty, uid: this.sessionUID })
            .then(() => this._notifyCartCount())
            .catch(err => {
                this._showQtyMessage(err?.body?.message || 'Could not update quantity.');
                this.loadCart(); // resync with server state
            });
    }

    _flushPendingSyncs() {
        return Promise.all(Object.keys(this._pendingQty).map(id => this._syncItem(id)));
    }

    _showQtyMessage(msg) {
        this.qtyMessage = msg;
        clearTimeout(this._qtyMessageTimer);
        this._qtyMessageTimer = setTimeout(() => { this.qtyMessage = ''; }, 4000);
    }

    _notifyCartCount() {
        this.dispatchEvent(new CustomEvent('cartcountchange', {
            detail: { refresh: true }, bubbles: true, composed: true
        }));
    }

    // ── Remove ────────────────────────────────────────────────────────────────

    handleRemove(event) {
        this._removeItem(event.target.dataset.id);
    }

    _removeItem(itemId) {
        clearTimeout(this._syncTimers[itemId]);
        delete this._syncTimers[itemId];
        delete this._pendingQty[itemId];
        this.cartItems = this.cartItems.filter(i => i.Id !== itemId);
        removeFromCart({ cartItemId: itemId, uid: this.sessionUID })
            .then(() => this._notifyCartCount())
            .catch(err => {
                console.error(err);
                this.loadCart();
            });
    }

    handleContinueShopping() {
        this.dispatchEvent(new CustomEvent('viewchange', {
            detail: { view: 'products' }, bubbles: true, composed: true
        }));
    }

    // window.confirm is blocked by Lightning Web Security, so clearing uses an
    // inline two-step confirm instead: Clear cart → [Yes, remove all | Keep items]
    @track confirmingClear = false;
    _confirmClearTimer = null;

    get clearCartLabel() {
        const n = this.cartItems.length;
        return `Remove all ${n} item${n === 1 ? '' : 's'}?`;
    }

    handleClearCartClick() {
        this.confirmingClear = true;
        // Auto-dismiss the confirm state if they walk away
        clearTimeout(this._confirmClearTimer);
        this._confirmClearTimer = setTimeout(() => { this.confirmingClear = false; }, 6000);
    }

    handleClearCartKeep() {
        clearTimeout(this._confirmClearTimer);
        this.confirmingClear = false;
    }

    handleClearCartConfirm() {
        clearTimeout(this._confirmClearTimer);
        this.confirmingClear = false;
        // Drop any debounced quantity edits — they'd recreate rows after the clear
        Object.keys(this._syncTimers).forEach((id) => clearTimeout(this._syncTimers[id]));
        this._syncTimers = {};
        this._pendingQty = {};
        this.cartItems = [];
        clearCart({ uid: this.sessionUID })
            .then(() => this._notifyCartCount())
            .catch((err) => {
                this._showQtyMessage(err?.body?.message || 'Could not clear the cart.');
                this.loadCart();
            });
    }

    handleCheckout() {
        // Make sure any debounced quantity edits reach the server before checkout loads
        this._flushPendingSyncs().then(() => {
            this.dispatchEvent(new CustomEvent('viewchange', {
                detail: { view: 'checkout' }, bubbles: true, composed: true
            }));
        });
    }
}