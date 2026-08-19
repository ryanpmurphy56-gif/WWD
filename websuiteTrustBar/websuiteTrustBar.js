import { LightningElement, api, wire } from 'lwc';
import { loadWebsuiteStyles, revealOnScroll } from 'c/websuiteStyles';
import getVisibleClients from '@salesforce/apex/WebsuiteClientController.getVisibleClients';

export default class WebsuiteTrustBar extends LightningElement {
    @api label = 'Live across regional Victoria';
    // Fallback list — used only if the Websuite_Client__c object has no visible
    // rows (or the guest user can't read it). The manager writes the real list.
    @api clients =
        'Bendigo Health Foundation, Buxton Bendigo, Ladd + Associates, Collective Standards, Goode Eco Designs, Mr Huw Williams';

    stylesLoaded = false;
    managedClients;

    @wire(getVisibleClients)
    wiredClients({ data }) {
        if (data && data.length) {
            this.managedClients = data.map((c) => c.name);
        }
    }

    renderedCallback() {
        if (this.stylesLoaded) {
            return;
        }
        this.stylesLoaded = true;
        loadWebsuiteStyles(this).catch((error) => {

            console.error('websuiteTrustBar: failed to load shared styles', error);
        });
        revealOnScroll(this, '.ws-trust-in li', { y: 14, duration: 0.5, stagger: 0.06 });
    }

    get clientList() {
        if (this.managedClients && this.managedClients.length) {
            return this.managedClients;
        }
        return this.clients
            .split(',')
            .map((name) => name.trim())
            .filter((name) => name.length > 0);
    }
}