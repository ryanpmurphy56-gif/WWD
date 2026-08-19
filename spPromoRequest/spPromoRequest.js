import { LightningElement, api, track, wire } from 'lwc';
import { refreshApex } from '@salesforce/apex';
import getRangedProducts      from '@salesforce/apex/SupplierPortalController.getRangedProducts';
import getPromotionRequests   from '@salesforce/apex/SupplierPortalController.getPromotionRequests';
import submitPromotionRequest from '@salesforce/apex/SupplierPortalController.submitPromotionRequest';

export default class SpPromoRequest extends LightningElement {
    // When the user clicks "Request Promo" on a specific product in the range
    // table, spPortal passes the product id so the dropdown pre-selects it.
    @api preselectedProductId = null;

    @track productOptions = [];
    @track requests       = [];
    @track form = {
        productId:     '',
        proposedPrice: '',
        startDate:     '',
        endDate:       '',
        notes:         ''
    };

    isLoading    = true;
    isSubmitting = false;
    formError    = '';
    formSuccess  = '';

    _fmt = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });
    _wiredRequests; // kept for refreshApex

    @wire(getRangedProducts)
    wiredProducts({ data, error }) {
        if (data) {
            this.productOptions = data.map((p) => ({
                value:    p.productId,
                label:    p.name,
                selected: p.productId === this.preselectedProductId
            }));
            if (this.preselectedProductId) {
                this.form = { ...this.form, productId: this.preselectedProductId };
            }
        } else if (error) {
            this.formError = this._extractError(error);
        }
    }

    @wire(getPromotionRequests)
    wiredRequests(result) {
        this._wiredRequests = result;
        const { data, error } = result;
        if (data) {
            this.requests  = data.map((r) => this._decorate(r));
            this.isLoading = false;
        } else if (error) {
            this.formError = this._extractError(error);
            this.isLoading = false;
        }
    }

    get hasRequests() {
        return this.requests && this.requests.length > 0;
    }

    handleInput(event) {
        const field = event.target.dataset.field;
        this.form = { ...this.form, [field]: event.target.value };
        this.formError   = '';
        this.formSuccess = '';
    }

    handleSubmit() {
        this.formError   = '';
        this.formSuccess = '';

        if (!this.form.productId) {
            this.formError = 'Please choose a product.';
            return;
        }
        if (this.form.startDate && this.form.endDate
                && this.form.endDate < this.form.startDate) {
            this.formError = 'End date cannot be before the start date.';
            return;
        }

        this.isSubmitting = true;
        submitPromotionRequest({
            productId:     this.form.productId,
            proposedPrice: this.form.proposedPrice
                ? parseFloat(this.form.proposedPrice)
                : null,
            startDate: this.form.startDate || null,
            endDate:   this.form.endDate   || null,
            notes:     this.form.notes     || null
        })
            .then(() => {
                this.formSuccess = 'Your promotion request has been submitted.';
                this.form = {
                    productId:     '',
                    proposedPrice: '',
                    startDate:     '',
                    endDate:       '',
                    notes:         ''
                };
                return refreshApex(this._wiredRequests);
            })
            .catch((error) => {
                this.formError = this._extractError(error);
            })
            .finally(() => {
                this.isSubmitting = false;
            });
    }

    _decorate(r) {
        const status = r.Status__c || 'Submitted';
        let statusClass = 'status-pill ';
        if (status === 'Approved')          statusClass += 'status-approved';
        else if (status === 'Declined')     statusClass += 'status-declined';
        else if (status === 'Under Review') statusClass += 'status-review';
        else                                statusClass += 'status-submitted';

        return {
            ...r,
            productName:  r.Product__r ? r.Product__r.Name : 'Unknown product',
            statusClass,
            displayPrice: r.Proposed_Price__c != null
                ? this._fmt.format(r.Proposed_Price__c)
                : '',
            displayDates: this._formatDateRange(r.Start_Date__c, r.End_Date__c)
        };
    }

    _formatDateRange(start, end) {
        const opts = { day: 'numeric', month: 'short', year: 'numeric' };
        if (start && end) {
            return new Date(start).toLocaleDateString('en-AU', opts)
                + ' – '
                + new Date(end).toLocaleDateString('en-AU', opts);
        }
        if (start) {
            return 'From ' + new Date(start).toLocaleDateString('en-AU', opts);
        }
        return 'No dates specified';
    }

    _extractError(error) {
        if (error && error.body && error.body.message) {
            return error.body.message;
        }
        return 'Something went wrong. Please try again.';
    }
}