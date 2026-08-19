import { LightningElement, wire } from 'lwc';
import getSiteStats from '@salesforce/apex/ProductGridController.getSiteStats';

export default class AboutUs extends LightningElement {
    productCount = '...';
    memberCount = '...';

    @wire(getSiteStats)
    wiredStats({ data, error }) {
        if (data) {
            this.productCount = data.productCount + '+';
            this.memberCount = data.memberCount + '+';
        } else if (error) {
            console.error(error);
        }
    }
}