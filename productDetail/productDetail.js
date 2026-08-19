import { LightningElement, track, wire } from 'lwc';
import { NavigationMixin, CurrentPageReference } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { publish, MessageContext } from 'lightning/messageService';
import PRODUCT_CHANNEL from '@salesforce/messageChannel/ProductFilters__c';
import getProductById from '@salesforce/apex/ProductGridController.getProductById';
import getRelatedProducts from '@salesforce/apex/ProductGridController.getRelatedProducts';
import addToCart from '@salesforce/apex/CartController.addToCart';
import getCartItems from '@salesforce/apex/CartController.getCartItems';
import getCartCount from '@salesforce/apex/CartController.getCartCount';
import checkIsMember from '@salesforce/apex/CartController.checkIsMember';
import { getSessionUID } from 'c/sessionService';

export default class ProductDetail extends NavigationMixin(LightningElement) {
    @track product;
    @track productId;
    @track quantity = 1;
    @track isAdding = false;
    @track showCartPopup = false;
    @track cartItems = [];
    @track cartCount = 0;
    @track isMember = false;
    @track relatedProducts = [];
    @track selectedFormat = '';
    sessionUID;

    @wire(MessageContext) messageContext;

    connectedCallback() {
        this.sessionUID = getSessionUID();
    }

    @wire(CurrentPageReference)
    pageRef(ref) {
        if (ref && ref.state && ref.state.productId) {
            this.productId = ref.state.productId;
        }
    }

    @wire(getProductById, { productId: '$productId' })
    wiredProduct({ data, error }) {
        if (data) {
            this.product = { ...data };
            const opts = this.formatOptions;
            if (opts && opts.length > 0) this.selectedFormat = opts[0].value;
        } else if (error) {
            console.error(error);
        }
    }

    @wire(getRelatedProducts, { family: '$productFamily', excludeId: '$productId' })
    wiredRelated({ data, error }) {
        if (data) {
            const fmt = this.fmt;
            const has = v => { const n = Number(v); return Number.isFinite(n) && n > 0; };
            const f   = v => fmt.format(Number(v));
            this.relatedProducts = data.map(p => {
                const family = (p.Family || '').toLowerCase();
                let price = '';
                if (family === 'beer') {
                    price = has(p.Price_6_Pack_New__c) ? f(p.Price_6_Pack_New__c) :
                            has(p.Price_Slab_of_24_new__c) ? f(p.Price_Slab_of_24_new__c) :
                            has(p.Price__c) ? f(p.Price__c) : '';
                } else {
                    price = has(p.Price__c) ? f(p.Price__c) : '';
                }
                return { ...p, displayPrice: price };
            });
        } else if (error) {
            console.error(error);
        }
    }

    get productFamily()      { return this.product ? this.product.Family : ''; }
    get hasRelatedProducts() { return this.relatedProducts && this.relatedProducts.length > 0; }

    @wire(checkIsMember)
    wiredMember({ data }) { if (data !== undefined) this.isMember = data; }

    get fmt() {
        return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });
    }

    get formatOptions() {
        if (!this.product) return [];
        const has = v => { const n = Number(v); return Number.isFinite(n) && n > 0; };
        const fmt = this.fmt;
        const f   = v => fmt.format(Number(v));
        const family = (this.product.Family || '').toLowerCase();
        const unit = this.product.QuantityUnitOfMeasure || 'Unit';
        const options = [];

        if (family === 'beer') {
            if (has(this.product.Price_6_Pack_New__c)) {
                const price = this.isMember && has(this.product.Members_Price_6_Pack__c)
                    ? f(this.product.Members_Price_6_Pack__c) : f(this.product.Price_6_Pack_New__c);
                options.push({ label: '6 Pack — ' + price, value: '6pack' });
            }
            if (has(this.product.Price_Slab_of_24_new__c)) {
                const price = this.isMember && has(this.product.Members_Price_Slab_of_24__c)
                    ? f(this.product.Members_Price_Slab_of_24__c) : f(this.product.Price_Slab_of_24_new__c);
                options.push({ label: 'Slab of 24 — ' + price, value: 'slab' });
            }
            if (has(this.product.Price__c)) {
                const price = this.isMember && has(this.product.Members_Price_Individual__c)
                    ? f(this.product.Members_Price_Individual__c) : f(this.product.Price__c);
                options.push({ label: 'Per ' + unit + ' — ' + price, value: 'single' });
            }
        } else if (family === 'wine') {
            if (has(this.product.Price__c)) {
                const price = this.isMember && has(this.product.Members_Price_Individual__c)
                    ? f(this.product.Members_Price_Individual__c) : f(this.product.Price__c);
                options.push({ label: 'Per ' + unit + ' — ' + price, value: 'single' });
            }
            if (has(this.product.Price_6_Pack_New__c)) {
                options.push({ label: '6 Bottles — ' + f(this.product.Price_6_Pack_New__c), value: '6pack' });
            }
        } else {
            if (has(this.product.Price__c)) {
                const price = this.isMember && has(this.product.Members_Price_Individual__c)
                    ? f(this.product.Members_Price_Individual__c) : f(this.product.Price__c);
                options.push({ label: 'Price — ' + price, value: 'single' });
            }
        }
        return options;
    }

    get hasFormatOptions() { return this.formatOptions && this.formatOptions.length > 1; }

    handleFormatChange(event) { this.selectedFormat = event.target.value; }

    get activePrice() {
        if (!this.product) return 0;
        const has = v => { const n = Number(v); return Number.isFinite(n) && n > 0; };
        const family = (this.product.Family || '').toLowerCase();

        if (family === 'beer') {
            if (this.selectedFormat === '6pack') {
                return this.isMember && has(this.product.Members_Price_6_Pack__c)
                    ? Number(this.product.Members_Price_6_Pack__c)
                    : Number(this.product.Price_6_Pack_New__c) || 0;
            }
            if (this.selectedFormat === 'slab') {
                return this.isMember && has(this.product.Members_Price_Slab_of_24__c)
                    ? Number(this.product.Members_Price_Slab_of_24__c)
                    : Number(this.product.Price_Slab_of_24_new__c) || 0;
            }
            if (this.selectedFormat === 'single') {
                return this.isMember && has(this.product.Members_Price_Individual__c)
                    ? Number(this.product.Members_Price_Individual__c)
                    : Number(this.product.Price__c) || 0;
            }
            if (has(this.product.Price_6_Pack_New__c)) return Number(this.product.Price_6_Pack_New__c);
            if (has(this.product.Price_Slab_of_24_new__c)) return Number(this.product.Price_Slab_of_24_new__c);
            return Number(this.product.Price__c) || 0;
        }

        if (family === 'wine') {
            if (this.selectedFormat === '6pack' && has(this.product.Price_6_Pack_New__c)) {
                return Number(this.product.Price_6_Pack_New__c);
            }
            if (this.isMember && has(this.product.Members_Price_Individual__c)) {
                return Number(this.product.Members_Price_Individual__c);
            }
            return Number(this.product.Price__c) || 0;
        }

        if (this.isMember && has(this.product.Members_Price_Individual__c)) {
            return Number(this.product.Members_Price_Individual__c);
        }
        return Number(this.product.Price__c) || 0;
    }

    get formattedActivePrice() { return this.activePrice ? this.fmt.format(this.activePrice) : ''; }

    get priceRows() {
        if (!this.product) return [];
        const fmt = this.fmt;
        const has = v => { const n = Number(v); return Number.isFinite(n) && n > 0; };
        const f   = v => fmt.format(Number(v));
        const family = (this.product.Family || '').toLowerCase();
        const rows = [];
        const unitLabel = this.product.QuantityUnitOfMeasure ? 'Per ' + this.product.QuantityUnitOfMeasure : 'Per Unit';
        const memberUnitLabel = this.product.QuantityUnitOfMeasure ? '✦ Member ' + this.product.QuantityUnitOfMeasure : '✦ Member Price';

        const reg = (label, field) => ({ key: label, label, formatted: f(this.product[field]), rowClass: 'price-row', labelClass: 'price-label', priceClass: 'regular-price' });
        const mem = (label, field) => ({ key: label, label, formatted: f(this.product[field]), rowClass: 'price-row member-row', labelClass: 'label-text', priceClass: 'member-price' });

        if (family === 'beer') {
            if (has(this.product.Price_6_Pack_New__c))     rows.push(reg('6 Pack', 'Price_6_Pack_New__c'));
            if (has(this.product.Price_Slab_of_24_new__c)) rows.push(reg('Slab of 24', 'Price_Slab_of_24_new__c'));
            if (has(this.product.Price__c))                rows.push(reg(unitLabel, 'Price__c'));
            if (this.isMember) {
                if (has(this.product.Members_Price_6_Pack__c))     rows.push(mem('✦ Member 6 Pack', 'Members_Price_6_Pack__c'));
                if (has(this.product.Members_Price_Slab_of_24__c)) rows.push(mem('✦ Member Slab', 'Members_Price_Slab_of_24__c'));
                if (has(this.product.Members_Price_Individual__c)) rows.push(mem(memberUnitLabel, 'Members_Price_Individual__c'));
            }
        } else if (family === 'wine') {
            if (has(this.product.Price__c))            rows.push(reg(unitLabel, 'Price__c'));
            if (has(this.product.Price_6_Pack_New__c)) rows.push(reg('6 Bottles', 'Price_6_Pack_New__c'));
            if (this.isMember && has(this.product.Members_Price_Individual__c)) {
                rows.push(mem('✦ Member Price', 'Members_Price_Individual__c'));
            }
        } else {
            if (has(this.product.Price__c)) rows.push(reg('Price', 'Price__c'));
            if (this.isMember && has(this.product.Members_Price_Individual__c) &&
                Number(this.product.Members_Price_Individual__c) < Number(this.product.Price__c)) {
                rows.push(mem('✦ Member Price', 'Members_Price_Individual__c'));
            }
        }
        return rows;
    }

    get bestMemberSaving() {
        if (!this.product) return 0;
        const has = v => { const n = Number(v); return Number.isFinite(n) && n > 0; };
        const family = (this.product.Family || '').toLowerCase();
        if (family === 'beer') {
            const s1 = has(this.product.Members_Price_6_Pack__c) && has(this.product.Price_6_Pack_New__c)
                ? Number(this.product.Price_6_Pack_New__c) - Number(this.product.Members_Price_6_Pack__c) : 0;
            const s2 = has(this.product.Members_Price_Slab_of_24__c) && has(this.product.Price_Slab_of_24_new__c)
                ? Number(this.product.Price_Slab_of_24_new__c) - Number(this.product.Members_Price_Slab_of_24__c) : 0;
            const s3 = has(this.product.Members_Price_Individual__c) && has(this.product.Price__c)
                ? Number(this.product.Price__c) - Number(this.product.Members_Price_Individual__c) : 0;
            return Math.max(s1, s2, s3);
        }
        if (has(this.product.Members_Price_Individual__c) && has(this.product.Price__c)) {
            return Number(this.product.Price__c) - Number(this.product.Members_Price_Individual__c);
        }
        return 0;
    }

    get showMemberSavings() { return this.isMember && this.bestMemberSaving > 0; }
    get formattedSavings()  { return this.bestMemberSaving > 0 ? this.fmt.format(this.bestMemberSaving) : ''; }

    get showMemberPromo() {
        if (this.isMember || !this.product) return false;
        const has = v => { const n = Number(v); return Number.isFinite(n) && n > 0; };
        return has(this.product.Members_Price_Individual__c) ||
               has(this.product.Members_Price_6_Pack__c)    ||
               has(this.product.Members_Price_Slab_of_24__c);
    }

    get showOfferRibbon() {
        if (!this.product) return false;
        const has = v => { const n = Number(v); return Number.isFinite(n) && n > 0; };
        const family = (this.product.Family || '').toLowerCase();
        if (family === 'beer') {
            return (has(this.product.Members_Price_6_Pack__c) && Number(this.product.Members_Price_6_Pack__c) < Number(this.product.Price_6_Pack_New__c)) ||
                   (has(this.product.Members_Price_Slab_of_24__c) && Number(this.product.Members_Price_Slab_of_24__c) < Number(this.product.Price_Slab_of_24_new__c)) ||
                   (has(this.product.Members_Price_Individual__c) && Number(this.product.Members_Price_Individual__c) < Number(this.product.Price__c));
        }
        return has(this.product.Members_Price_Individual__c) &&
               Number(this.product.Members_Price_Individual__c) < Number(this.product.Price__c);
    }

    get hasTastingNotes() { return this.product && this.product.Tasting_Notes__c; }
    get inStock()         { return this.product && this.product.Quantity_on_Hand__c > 0; }
    get isLowStock()      { return this.product && this.product.Quantity_on_Hand__c <= 5 && this.product.Quantity_on_Hand__c > 0; }
    get isQtyMin()        { return this.quantity <= 1; }
    get isQtyMax()        { return this.product && this.quantity >= this.product.Quantity_on_Hand__c; }
    get addDisabled()     { return this.isAdding || !this.inStock; }
    get showLineTotal()   { return this.quantity > 1 && this.activePrice > 0; }
    get formattedLineTotal() { return this.fmt.format(this.activePrice * this.quantity); }

    handleDecreaseQty() { if (this.quantity > 1) this.quantity -= 1; }
    handleIncreaseQty() {
        if (!this.product || this.quantity < this.product.Quantity_on_Hand__c) this.quantity += 1;
    }

    handleAddToCart() {
        this.isAdding = true;
        addToCart({ productId: this.productId, uid: this.sessionUID, selectedFormat: this.selectedFormat })
            .then(() => {
                this.isAdding = false;
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
                this.isAdding = false;
                this.dispatchEvent(new ShowToastEvent({
                    title: 'Could not add to cart',
                    message: error.body ? error.body.message : 'An error occurred.',
                    variant: 'error'
                }));
            });
    }

    handleRelatedAddToCart(event) {
        event.stopPropagation();
        const productId = event.currentTarget.dataset.id;
        addToCart({ productId, uid: this.sessionUID, selectedFormat: 'single' })
            .then(() => getCartCount({ uid: this.sessionUID }))
            .then(count => {
                this.cartCount = count;
                publish(this.messageContext, PRODUCT_CHANNEL, { cartCount: count });
                this.dispatchEvent(new ShowToastEvent({ title: 'Added to cart', variant: 'success' }));
            })
            .catch(error => {
                this.dispatchEvent(new ShowToastEvent({
                    title: 'Could not add to cart',
                    message: error.body ? error.body.message : 'An error occurred.',
                    variant: 'error'
                }));
            });
    }

    handleRelatedNavigate(event) {
        const productId = event.currentTarget.dataset.id;
        this[NavigationMixin.Navigate]({
            type: 'standard__webPage',
            attributes: { url: '/product-detail?productId=' + productId }
        });
    }

    handleBack() {
        this[NavigationMixin.Navigate]({ type: 'standard__webPage', attributes: { url: '/products' } });
    }

    handleSignUp() {
        this[NavigationMixin.Navigate]({ type: 'standard__webPage', attributes: { url: '/login' } });
    }

    handleClosePopup() { this.showCartPopup = false; }

    handleViewCart() {
        this.showCartPopup = false;
        this[NavigationMixin.Navigate]({ type: 'standard__webPage', attributes: { url: '/cart' } });
    }
}