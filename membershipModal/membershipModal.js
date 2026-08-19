import { LightningElement, wire, track } from 'lwc';
import getMemberDetails from '@salesforce/apex/MemberController.getMemberDetails';
import LOGO_RESOURCE from '@salesforce/resourceUrl/pointnpourlogo'; 

export default class MembershipModal extends LightningElement {
    @track member;
    @track error;
    logoUrl = LOGO_RESOURCE;

    @wire(getMemberDetails)
    wiredMember({ error, data }) {
        if (data) {
            this.member = data;
            this.error = undefined;
        } else if (error) {
            this.error = error;
            this.member = undefined;
            console.error('Apex Error:', error);
        }
    }

    // This extracts just the https link from the <img> tag in your Barcode field
    get barcodeUrl() {
        if (this.member && this.member.Barcode__c) {
            const match = this.member.Barcode__c.match(/src="([^"]+)"/);
            return match ? match[1] : null;
        }
        return null;
    }

    handleClose() {
        this.dispatchEvent(new CustomEvent('close'));
    }
}