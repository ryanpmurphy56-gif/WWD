import { LightningElement, wire, track } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import LOGO_RESOURCE from '@salesforce/resourceUrl/pointnpourlogo';
import { publish, subscribe, MessageContext } from 'lightning/messageService';
import PRODUCT_CHANNEL from '@salesforce/messageChannel/ProductFilters__c';
import isGuestUser from '@salesforce/user/isGuest';

export default class Header extends NavigationMixin(LightningElement) {
    logoUrl = LOGO_RESOURCE;

    @track isModalOpen = false;
    @track cartItemsCount = 0;

    isLoggedIn = !isGuestUser;

    @wire(MessageContext)
    messageContext;

    connectedCallback() {
        subscribe(this.messageContext, PRODUCT_CHANNEL, (message) => {
            if (message.cartCount !== undefined) {
                this.cartItemsCount = message.cartCount;
            }
        });
    }

    get cartBadgeVisible() { return this.cartItemsCount > 0; }
    get cartLabel() {
        return this.cartItemsCount > 0 ? 'Cart (' + this.cartItemsCount + ')' : 'Cart';
    }

    handleLogoClick() {
        this[NavigationMixin.Navigate]({
            type: 'standard__webPage',
            attributes: { url: '/home' }
        });
    }

    handleLogoError(event) { event.target.style.display = 'none'; }

    handleShowMemberCard() { this.isModalOpen = true; }
    closeModal() { this.isModalOpen = false; }

    handleLogin() {
        this[NavigationMixin.Navigate]({
            type: 'standard__webPage',
            attributes: { url: '/login' }
        });
    }

    handleSearchSubmit() {
        const searchInput = this.refs.searchInput;
        const val = searchInput ? searchInput.value.trim() : '';
        if (val) {
            publish(this.messageContext, PRODUCT_CHANNEL, { searchKey: val });
        }
    }

    handleSearchKeyUp(event) {
        if (event.key === 'Enter') this.handleSearchSubmit();
    }

    handleFamilyChange(event) {
        const family = event.target.dataset.page;
        this[NavigationMixin.Navigate]({
            type: 'comm__namedPage',
            attributes: { name: family }
        });
    }

    handleViewCart() {
        this[NavigationMixin.Navigate]({
            type: 'standard__webPage',
            attributes: { url: '/cart' }
        });
    }
}