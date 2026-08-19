import { LightningElement, track } from 'lwc';
import isGuestUser from '@salesforce/user/isGuest';

import getStripePublishableKey    from '@salesforce/apex/CheckoutController.getStripePublishableKey';
import getCheckoutSummaryForUid   from '@salesforce/apex/CheckoutController.getCheckoutSummaryForUid';
import createPaymentIntentForCart from '@salesforce/apex/CheckoutController.createPaymentIntentForCart';
import placeOrderForUid           from '@salesforce/apex/CheckoutController.placeOrderForUid';
import validateCartStock          from '@salesforce/apex/CartController.validateCartStock';
import getDeliveryQuote           from '@salesforce/apex/ShippingController.getDeliveryQuote';
import checkCode                  from '@salesforce/apex/DiscountCodeService.checkCode';
import { getSessionUID, clearSessionUID } from 'c/sessionService';
import { trackEvent } from 'c/funnelTracker';

const DELIVERY_FEE  = 9.95;
const STRIPE_JS_URL = 'https://js.stripe.com/v3/';

export default class Checkout extends LightningElement {

    @track isLoading    = true;
    @track isPlacing    = false;
    @track orderPlaced  = false;
    @track stripeReady  = false;
    @track errorMessage = '';

    @track orderNumber   = '';
    @track cartItems     = [];
    @track subtotal      = 0;
    @track memberSavings = 0;
    @track saleSavings   = 0;
    @track firstOrderDiscount = 0;
    @track isMember      = false;

    @track fulfilmentType   = 'Delivery';
    @track deliveryStreet   = '';
    @track deliverySuburb   = '';
    @track deliveryState    = 'VIC';
    @track deliveryPostcode = '';
    @track deliveryNotes    = '';
    @track ageVerified      = false;
    @track saveAddress      = false;

    // Discount code
    @track codeInput    = '';
    @track appliedCode  = '';
    @track codeDiscount = 0;
    @track codeMessage  = '';
    @track codeIsError  = false;
    @track codeChecking = false;

    // Live AusPost postage quote; flat rate until a postcode gives us a real one
    @track deliveryFee      = DELIVERY_FEE;
    @track quoteLoading     = false;
    @track shippingService  = '';
    _quoteTimer = null;

    _stripe       = null;
    _cardElement  = null;
    _checkoutTracked = false;  // guard against double-firing on re-renders

    uid = getSessionUID();

    get isGuest() { return isGuestUser; }

    connectedCallback() {
        if (!this.isGuest) {
            this._loadStripeJs();
        }
        this._loadSummary();
    }

    // ── Getters ───────────────────────────────────────────────────────────────

    get hasItems()         { return this.cartItems && this.cartItems.length > 0; }
    get isDelivery()       { return this.fulfilmentType === 'Delivery'; }
    get hasMemberSavings() { return this.isMember && this.memberSavings > 0; }
    get hasSaleSavings()        { return this.saleSavings > 0; }
    get formattedSaleSavings()  { return this._fmt(this.saleSavings); }

    // Stacking policy (mirrors CheckoutController): the customer gets the LARGER
    // of the first-order discount and the discount code — never both.
    get effectiveFirstOrderDiscount() {
        return this.codeDiscount >= this.firstOrderDiscount ? 0 : this.firstOrderDiscount;
    }
    get effectiveCodeDiscount() {
        return this.codeDiscount >= this.firstOrderDiscount ? this.codeDiscount : 0;
    }
    get hasFirstOrderDiscount() { return this.effectiveFirstOrderDiscount > 0; }
    get hasCodeDiscount()       { return this.effectiveCodeDiscount > 0; }
    get codeBeatenByFirstOrder() {
        return this.appliedCode && this.codeDiscount > 0 && this.effectiveCodeDiscount === 0;
    }

    get totalAmount() {
        return this.subtotal
            - this.effectiveFirstOrderDiscount
            - this.effectiveCodeDiscount
            + (this.isDelivery ? this.deliveryFee : 0);
    }
    get formattedSubtotal()     { return this._fmt(this.subtotal); }
    get formattedMemberSavings(){ return this._fmt(this.memberSavings); }
    get formattedFirstOrderDiscount() { return this._fmt(this.effectiveFirstOrderDiscount); }
    get formattedCodeDiscount() { return this._fmt(this.effectiveCodeDiscount); }
    get formattedTotal()        { return this._fmt(this.totalAmount); }
    get paymentStepLabel()  { return this.isDelivery ? '3' : '2'; }
    get ageStepLabel()      { return this.isDelivery ? '4' : '3'; }
    get deliveryBtnClass()  { return this.isDelivery ? 'fulfilment-btn fulfilment-btn--active' : 'fulfilment-btn'; }
    get collectBtnClass()   { return !this.isDelivery ? 'fulfilment-btn fulfilment-btn--active' : 'fulfilment-btn'; }

    get placingLabel() { return 'Processing Payment...'; }
    get formattedDeliveryFee() { return this._fmt(this.deliveryFee); }
    get deliveryFeeLabel()     { return this.shippingService ? `Delivery (${this.shippingService})` : 'Delivery Fee'; }
    get isPlaceOrderDisabled() { return this.isPlacing || this.quoteLoading; }
    get codeMessageClass()     { return this.codeIsError ? 'code-message code-message--error' : 'code-message code-message--ok'; }
    get applyCodeLabel()       { return this.codeChecking ? 'Checking…' : 'Apply'; }
    get hasAppliedCode()       { return !!this.appliedCode; }

    // ── Handlers ──────────────────────────────────────────────────────────────

    handleSelectDelivery() {
        this.fulfilmentType = 'Delivery';
        this._schedulePostageQuote();
    }
    // Order.Fulfilment_Type__c is a restricted picklist: Delivery | ClickAndCollect
    handleSelectCollect()  { this.fulfilmentType = 'ClickAndCollect'; }

    handleFieldChange(event) {
        const field = event.target.dataset.field;
        if (field) this[field] = event.target.value;
        if (field === 'deliveryPostcode') this._schedulePostageQuote();
    }

    handleSaveAddressToggle(event) { this.saveAddress = event.target.checked; }

    // ── Discount code ─────────────────────────────────────────────────────────

    handleCodeInput(event) {
        this.codeInput = event.target.value;
    }

    handleApplyCode() {
        const code = (this.codeInput || '').trim();
        if (!code) return;
        this.codeChecking = true;
        this.codeMessage = '';
        checkCode({ code, subtotal: this.subtotal, isMember: this.isMember })
            .then((result) => {
                if (result.valid) {
                    this.appliedCode  = result.code;
                    this.codeDiscount = result.discountAmount || 0;
                    this.codeIsError  = false;
                    this.codeMessage  = this.codeBeatenByFirstOrder
                        ? `Code ${result.code} applied — but your 15% first-order discount is bigger, so we kept that one for you.`
                        : result.message;
                } else {
                    this.appliedCode  = '';
                    this.codeDiscount = 0;
                    this.codeIsError  = true;
                    this.codeMessage  = result.message;
                }
            })
            .catch((error) => {
                this.appliedCode  = '';
                this.codeDiscount = 0;
                this.codeIsError  = true;
                this.codeMessage  = error?.body?.message || 'Could not check that code.';
            })
            .finally(() => { this.codeChecking = false; });
    }

    handleRemoveCode() {
        this.appliedCode  = '';
        this.codeDiscount = 0;
        this.codeInput    = '';
        this.codeMessage  = '';
        this.codeIsError  = false;
    }

    // ── Postage quote ─────────────────────────────────────────────────────────

    _schedulePostageQuote() {
        clearTimeout(this._quoteTimer);
        const pc = (this.deliveryPostcode || '').trim();
        if (!this.isDelivery || !/^\d{4}$/.test(pc)) return;
        this._quoteTimer = setTimeout(() => this._fetchPostageQuote(pc), 500);
    }

    _fetchPostageQuote(pc) {
        this.quoteLoading = true;
        getDeliveryQuote({ uid: this.uid, toPostcode: pc })
            .then((quote) => {
                this.deliveryFee     = quote.cost;
                this.shippingService = quote.serviceName || 'Australia Post';
            })
            .catch(() => {
                // API unavailable — fall back to the flat rate
                this.deliveryFee     = DELIVERY_FEE;
                this.shippingService = '';
            })
            .finally(() => { this.quoteLoading = false; });
    }

    disconnectedCallback() {
        clearTimeout(this._quoteTimer);
    }

    handleAgeVerify(event) { this.ageVerified = event.target.checked; }

    handleGoToLogin() {
        this.dispatchEvent(new CustomEvent('viewchange', {
            detail: { view: 'login' }, bubbles: true, composed: true
        }));
    }

    handleContinueShopping() {
        this.dispatchEvent(new CustomEvent('viewchange', {
            detail: { view: 'products' }, bubbles: true, composed: true
        }));
        clearSessionUID();
        this.dispatchEvent(new CustomEvent('cartcleared', { bubbles: true, composed: true }));
    }

    handlePlaceOrder() {
        this.errorMessage = '';
        if (!this.hasItems)     { this.errorMessage = 'Your cart is empty.'; return; }
        if (this.isDelivery && (!this.deliveryStreet || !this.deliverySuburb || !this.deliveryPostcode)) {
            this.errorMessage = 'Please fill in your delivery address.'; return;
        }
        if (!this.ageVerified)  { this.errorMessage = 'Please confirm you are 18 years or older.'; return; }
        if (!this._stripe || !this._cardElement) {
            this.errorMessage = 'Payment form is still loading — please wait a moment.'; return;
        }

        this.isPlacing = true;
        // Confirm stock before charging the card — never take payment for unavailable items.
        // The payment amount is computed SERVER-side; what comes back is what gets charged.
        validateCartStock({ uid: this.uid })
            .then(() => createPaymentIntentForCart({
                uid:            this.uid,
                fulfilmentType: this.fulfilmentType,
                toPostcode:     this.isDelivery ? this.deliveryPostcode.trim() : null,
                discountCode:   this.appliedCode || null
            }))
            .then((intent) => {
                // Sync the display with the authoritative server amounts
                this.deliveryFee        = intent.deliveryFee || 0;
                this.firstOrderDiscount = intent.firstOrderDiscount || 0;
                this.codeDiscount       = intent.codeDiscount || 0;

                const paymentMethod = { card: this._cardElement };
                if (this.isDelivery && this.deliveryPostcode) {
                    paymentMethod.billing_details = {
                        address: { postal_code: this.deliveryPostcode.trim(), country: 'AU' }
                    };
                }
                return this._stripe.confirmCardPayment(intent.clientSecret, {
                    payment_method: paymentMethod
                });
            })
            .then((result) => {
                if (result.error) throw new Error(result.error.message);
                return placeOrderForUid({
                    paymentIntentId:   result.paymentIntent.id,
                    fulfilmentType:    this.fulfilmentType,
                    deliveryStreet:    this.deliveryStreet,
                    deliverySuburb:    this.deliverySuburb,
                    deliveryState:     this.deliveryState || 'VIC',
                    deliveryPostcode:  this.deliveryPostcode,
                    deliveryNotes:     this.deliveryNotes,
                    uid:               this.uid,
                    discountCode:      this.appliedCode || null,
                    saveAddress:       this.saveAddress
                });
            })
            .then((placed) => {
                this.orderNumber = placed.orderNumber || placed.orderId;
                this.orderPlaced = true;
            })
            .catch((error) => {
                this.errorMessage = error?.message || error?.body?.message || 'Something went wrong. Please try again.';
            })
            .finally(() => { this.isPlacing = false; });
    }

    // ── Private ───────────────────────────────────────────────────────────────

    _loadSummary() {
        this.isLoading = true;
        getCheckoutSummaryForUid({ uid: this.uid })
            .then((data) => {
                if (!data) { this.cartItems = []; return; }
                this.isMember           = data.isMember;
                this.subtotal           = data.subtotal           || 0;
                this.memberSavings      = data.memberSavings      || 0;
                this.saleSavings        = data.saleSavings        || 0;
                this.firstOrderDiscount = data.firstOrderDiscount || 0;
                this.cartItems     = (data.items || []).map((item) => ({
                    ...item,
                    formattedLineTotal: this._fmt(item.lineTotal || 0)
                }));

                // Prefill the saved default delivery address
                if (data.savedStreet)   this.deliveryStreet   = data.savedStreet;
                if (data.savedSuburb)   this.deliverySuburb   = data.savedSuburb;
                if (data.savedState)    this.deliveryState    = data.savedState;
                if (data.savedPostcode) {
                    this.deliveryPostcode = data.savedPostcode;
                    this._schedulePostageQuote();
                }

                // Funnel tracking: fire one Checkout_Start event per cart line.
                // Guard against double-firing if _loadSummary is ever called twice
                if (!this._checkoutTracked && data.items && data.items.length > 0) {
                    data.items.forEach((item) => {
                        if (item.productId) {
                            trackEvent('Checkout_Start', item.productId, {
                                cartId: data.cartId,
                                quantity: item.quantity,
                                unitPrice: item.regularPrice
                            });
                        }
                    });
                    this._checkoutTracked = true;
                }
            })
            .catch((error) => {
                this.errorMessage = error?.body?.message || 'Could not load your cart.';
            })
            .finally(() => { this.isLoading = false; });
    }

    _loadStripeJs() {
        if (document.querySelector(`script[src="${STRIPE_JS_URL}"]`)) {
            this._initStripe(); return;
        }
        const script   = document.createElement('script');
        script.src     = STRIPE_JS_URL;
        script.onload  = () => this._initStripe();
        script.onerror = () => { this.errorMessage = 'Could not load the payment form.'; };
        document.head.appendChild(script);
    }

    _initStripe() {
        getStripePublishableKey()
            .then((publishableKey) => {
                // eslint-disable-next-line no-undef
                this._stripe      = Stripe(publishableKey);
                const elements    = this._stripe.elements();
                this._cardElement = elements.create('card', {
                    // The combined element's ZIP field switches to US mode (5 digits)
                    // based on the card BIN — hide it and send our own postcode instead.
                    hidePostalCode: true,
                    style: {
                        base:    { fontSize: '16px', color: '#32325d', '::placeholder': { color: '#aab7c4' } },
                        invalid: { color: '#e25950' }
                    }
                });
                this._mountCardElement();
            })
            .catch(() => { this.errorMessage = 'Could not initialise payment. Please refresh.'; });
    }

    // The card element can be ready before the form is rendered (summary still
    // loading) — renderedCallback retries the mount until the target exists.
    _mountCardElement() {
        if (!this._cardElement || this.stripeReady) return;
        const mountTarget = this.refs.stripeCardElement;
        if (!mountTarget) return;
        this._cardElement.mount(mountTarget);
        this._cardElement.on('change', (event) => {
            const errorEl = this.refs.stripeCardErrors;
            if (errorEl) errorEl.textContent = event.error ? event.error.message : '';
        });
        this.stripeReady = true;
    }

    renderedCallback() {
        this._mountCardElement();
    }

    _fmt(value) {
        return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(value || 0);
    }
}