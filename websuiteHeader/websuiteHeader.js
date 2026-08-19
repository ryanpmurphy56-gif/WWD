import { LightningElement, api } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import getCurrentAccount from '@salesforce/apex/WebsuiteAccountAuthController.getCurrentAccount';
import {
    loadWebsuiteStyles,
    openWizard,
    openLoginModal,
    getStoredAccountSession,
    ACCOUNT_SESSION_CHANGED_EVENT
} from 'c/websuiteStyles';

const CONDENSE_AT = 140; // px scrolled before the nav folds into the corner pill

export default class WebsuiteHeader extends NavigationMixin(LightningElement) {
    @api logoText = 'Websuite';
    @api ctaLabel = 'See your site';
    @api editorLabel = 'Go to editor';
    @api pillTagline = '"Scroll with style"';
    @api navTemplatesLabel = 'Templates';
    @api navEditorLabel = 'The editor';
    @api navFeaturesLabel = 'Features';
    @api navWorkLabel = 'Our work';
    @api navPricingLabel = 'Pricing';
    @api navSupportLabel = 'Support';
    @api loginLabel = 'Log in';

    stylesLoaded = false;
    condensed = false;
    accountFirstName; // set once getCurrentAccount confirms a live session; undefined/null = logged out

    connectedCallback() {
        this.boundScroll = () => this.handleScroll();
        window.addEventListener('scroll', this.boundScroll, { passive: true });

        this.boundAccountChange = () => this.refreshAccountState();
        window.addEventListener(ACCOUNT_SESSION_CHANGED_EVENT, this.boundAccountChange);
        this.refreshAccountState();
    }

    disconnectedCallback() {
        window.removeEventListener('scroll', this.boundScroll);
        window.removeEventListener(ACCOUNT_SESSION_CHANGED_EVENT, this.boundAccountChange);
    }

    // Re-checks localStorage + the server on every login/logout anywhere on the
    // page (websuiteLoginModal / websuiteAccountPage both fire the change event),
    // so the header's own button never needs a full page reload to update.
    refreshAccountState() {
        const stored = getStoredAccountSession();
        if (!stored || !stored.accountId || !stored.token) {
            this.accountFirstName = null;
            return;
        }
        getCurrentAccount({ accountId: stored.accountId, sessionToken: stored.token })
            .then((session) => {
                this.accountFirstName = session ? session.firstName || 'Account' : null;
            })
            .catch(() => {
                this.accountFirstName = null;
            });
    }

    renderedCallback() {
        if (this.stylesLoaded) {
            return;
        }
        this.stylesLoaded = true;
        loadWebsuiteStyles(this).catch((error) => {

            console.error('websuiteHeader: failed to load shared styles', error);
        });
    }

    handleScroll() {
        const next = window.scrollY > CONDENSE_AT;
        if (next !== this.condensed) {
            this.condensed = next;
        }
    }

    get navClass() {
        return this.condensed ? 'ws-nav ws-nav_hidden' : 'ws-nav';
    }

    get pillClass() {
        return this.condensed ? 'ws-pill ws-pill_on' : 'ws-pill';
    }

    get navLinks() {
        return [
            { id: 'templates', href: '#templates', label: this.navTemplatesLabel },
            { id: 'editor', href: '#editor', label: this.navEditorLabel },
            { id: 'features', href: '#features', label: this.navFeaturesLabel },
            { id: 'work', href: '#work', label: this.navWorkLabel },
            { id: 'pricing', href: '#pricing', label: this.navPricingLabel },
            { id: 'support', href: '#support', label: this.navSupportLabel }
        ];
    }

    get isLoggedIn() {
        return !!this.accountFirstName;
    }
    get accountButtonLabel() {
        return this.accountFirstName || this.loginLabel;
    }

    handleCtaClick() {
        openWizard();
    }

    // Logged out -> opens the login modal in place. Logged in -> goes straight
    // to the Account page (websuiteAccountPage), same NavigationMixin pattern
    // handleEditorClick already uses for /editor.
    handleAccountClick() {
        if (this.isLoggedIn) {
            this[NavigationMixin.Navigate]({
                type: 'standard__webPage',
                attributes: { url: '/account' }
            });
        } else {
            openLoginModal();
        }
    }

    // Jumps straight to the editor Experience page, bypassing the wizard —
    // for people who already have a site and just want to keep editing.
    handleEditorClick() {
        this[NavigationMixin.Navigate]({
            type: 'standard__webPage',
            attributes: { url: '/editor' }
        });
    }

    handleLogoClick() {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}