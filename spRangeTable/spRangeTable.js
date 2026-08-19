import { LightningElement, track, wire } from 'lwc';
import getRangedProducts from '@salesforce/apex/SupplierPortalController.getRangedProducts';
import getPortalSummary  from '@salesforce/apex/SupplierPortalController.getPortalSummary';

export default class SpRangeTable extends LightningElement {
    @track products = [];
    @track summary = {
        rangedCount:   0,
        unitsSold:     0,
        lowStockCount: 0,
        openRequests:  0
    };
    isLoading    = true;
    errorMessage = '';

    _fmt = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });

    @wire(getPortalSummary)
    wiredSummary({ data, error }) {
        if (data) {
            this.summary = data;
        } else if (error) {
            this.errorMessage = this._extractError(error);
        }
    }

    @wire(getRangedProducts)
    wiredProducts({ data, error }) {
        if (data) {
            this.products = data.map((p) => ({
                ...p,
                displayPrice: p.sellingPrice != null
                    ? this._fmt.format(p.sellingPrice)
                    : '—',
                displayMinQty: p.minimumQuantity != null
                    ? p.minimumQuantity
                    : '—',
                statusClass: this._statusClass(p.stockStatus)
            }));
            this.isLoading = false;
        } else if (error) {
            this.errorMessage = this._extractError(error);
            this.isLoading = false;
        }
    }

    get hasProducts() {
        return this.products && this.products.length > 0;
    }

    _statusClass(status) {
        if (status === 'Out of Stock') return 'status-pill status-out';
        if (status === 'Low Stock')    return 'status-pill status-low';
        return 'status-pill status-in';
    }

    handleRequestPromo(event) {
        const productId   = event.currentTarget.dataset.id;
        const productName = event.currentTarget.dataset.name;
        this.dispatchEvent(new CustomEvent('requestpromo', {
            detail:   { productId, productName },
            bubbles:  true,
            composed: true
        }));
    }

    _extractError(error) {
        if (error && error.body && error.body.message) {
            return error.body.message;
        }
        return 'Something went wrong loading your range. Please try again.';
    }
}