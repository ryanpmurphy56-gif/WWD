import { LightningElement, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import getProductsByFamily from '@salesforce/apex/ProductGridController.getProductsByFamily';

export default class HomePage extends NavigationMixin(LightningElement) {
    saleItems = [];

    @wire(getProductsByFamily, { family: 'offers', subFamily: '', searchKey: '' })
    wiredSaleItems({ data, error }) {
        if (data) {
            const fmt = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });
            this.saleItems = data.slice(0, 12).map(p => ({
                ...p,
                formattedPrice: p.Members_Price_Individual__c
                    ? fmt.format(p.Members_Price_Individual__c)
                    : fmt.format(p.Price__c)
            }));
        } else if (error) {
            console.error('Error loading sale items:', error);
        }
    }

    get hasSaleItems() {
        return this.saleItems && this.saleItems.length > 0;
    }

    handleNavigate(event) {
        const productId = event.currentTarget.dataset.id;
        this[NavigationMixin.Navigate]({
            type: 'standard__webPage',
            attributes: {
                url: '/product-detail?productId=' + productId
            }
        });
    }
}