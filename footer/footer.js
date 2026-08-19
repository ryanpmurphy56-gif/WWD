import { LightningElement } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import LOGO_RESOURCE from '@salesforce/resourceUrl/pointnpourlogo';
import isGuestUser from '@salesforce/user/isGuest';

export default class Footer extends NavigationMixin(LightningElement) {
    logoUrl = LOGO_RESOURCE;
    isGuest = isGuestUser;

    get currentYear() {
        return new Date().getFullYear();
    }

    handleLogoError(event) {
        event.target.style.display = 'none';
    }

    handleNav(event) {
        const url = event.target.dataset.url;
        this[NavigationMixin.Navigate]({
            type: 'standard__webPage',
            attributes: { url }
        });
    }

    handleGuestGated(event) {
        const url = event.target.dataset.url;
        if (this.isGuest) {
            this[NavigationMixin.Navigate]({
                type: 'standard__webPage',
                attributes: { url: '/login' }
            });
        } else {
            this[NavigationMixin.Navigate]({
                type: 'standard__webPage',
                attributes: { url }
            });
        }
    }
}