import { LightningElement, track } from 'lwc';
import LOGO_RESOURCE from '@salesforce/resourceUrl/pointnpourlogo';

export default class AgeVerification extends LightningElement {
    @track showGate = true;
    logoUrl = LOGO_RESOURCE;

    connectedCallback() {
        const verified = sessionStorage.getItem('ageVerified');
        if (verified === 'true') {
            this.showGate = false;
        }
    }

    handleConfirm() {
        sessionStorage.setItem('ageVerified', 'true');
        this.showGate = false;
    }

    handleDeny() {
        window.location.href = 'https://www.google.com';
    }
}