import { LightningElement, api, wire } from 'lwc';
import getSupplierProfile from '@salesforce/apex/SupplierPortalController.getSupplierProfile';

export default class SpHeader extends LightningElement {
    @api activeTab = 'range';

    supplierName = '';
    contactName  = '';
    contactEmail = '';

    @wire(getSupplierProfile)
    wiredProfile({ data, error }) {
        if (data) {
            this.supplierName = data.supplierName;
            this.contactName  = data.contactName;
            this.contactEmail = data.contactEmail;
        } else if (error) {
            // Header stays generic; inner components surface the real error.
            console.error('getSupplierProfile error', error);
        }
    }

    get rangeClass() {
        return this.activeTab === 'range' ? 'nav-btn active' : 'nav-btn';
    }
    get promosClass() {
        return this.activeTab === 'promos' ? 'nav-btn active' : 'nav-btn';
    }

    handleNav(event) {
        const tab = event.target.dataset.tab;
        this.dispatchEvent(new CustomEvent('navigate', { detail: tab }));
    }
}