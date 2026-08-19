import { LightningElement, track } from 'lwc';

export default class SpPortal extends LightningElement {
    @track activeTab = 'range';
    @track preselectedProductId = null;

    get isRange()  { return this.activeTab === 'range'; }
    get isPromos() { return this.activeTab === 'promos'; }

    handleNavigate(event) {
        this.activeTab = event.detail;
    }

    // Fired by spRangeTable's "Request Promo" button — switch to promos tab
    // and pre-select the product so the form is ready to go.
    handleRequestPromo(event) {
        this.preselectedProductId = event.detail.productId;
        this.activeTab = 'promos';
    }
}