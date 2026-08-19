import { LightningElement, wire } from 'lwc';
import getMemberDetails from '@salesforce/apex/PnpV2MemberController.getMemberDetails';
import { popIn } from 'c/pnpGsap';

export default class PnpV2MemberCard extends LightningElement {
    memberCard;

    renderedCallback() {
        popIn(this, '.membership-card');
    }

    @wire(getMemberDetails)
    wiredMember({ data, error }) {
        if (data) { this.memberCard = data; }
        else if (error) { this.memberCard = null; console.error('Member card error:', error); }
    }

    get memberNumber() {
        return this.memberCard?.Member_Number__c || 'Not available';
    }

    get memberName() {
        // Card names are stored as "First Last Membership"
        const raw = this.memberCard?.Name || '';
        return raw.replace(/\s*Membership\s*$/i, '');
    }

    get expiryLabel() {
        // Memberships are permanent unless an expiry has been set explicitly
        if (!this.memberCard?.Expiry_Date__c) return 'Never expires';
        return new Date(this.memberCard.Expiry_Date__c).toLocaleDateString('en-AU', {
            day: 'numeric', month: 'short', year: 'numeric'
        });
    }

    get barcodeUrl() {
        if (!this.memberCard?.Member_Number__c) return '';
        return 'https://barcodeapi.org/api/128/' + encodeURIComponent(this.memberCard.Member_Number__c);
    }

    handleBarcodeError(event) {
        event.target.style.display = 'none';
        event.target.nextElementSibling?.style.setProperty('display', 'flex');
    }
}