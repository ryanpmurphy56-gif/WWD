import { LightningElement } from 'lwc';
import isGuestUser from '@salesforce/user/isGuest';
import { fadeUpIn } from 'c/pnpGsap';

export default class PnpV2MemberDashboard extends LightningElement {
    connectedCallback() {
        if (isGuestUser) {
            this.dispatchEvent(new CustomEvent('viewchange', {
                detail: { view: 'login' }, bubbles: true, composed: true
            }));
        }
    }

    renderedCallback() {
        fadeUpIn(this, '.welcome-card, .left-column, .right-column', { stagger: 0.12 });
    }
}