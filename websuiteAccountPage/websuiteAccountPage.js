/**
 * websuiteAccountPage — the logged-in landing page for a WebSuite customer:
 * their account details and the sites they own (WebsuiteAccountAuthController
 * .getMySites, keyed off Website_Site__c.Websuite_Account__c, populated at
 * site-creation time by siteStateService.save() when a session is present).
 *
 * Drop this on the "Account" page in Experience Builder — the page
 * websuiteLoginModal navigates to right after a successful login.
 */
import { LightningElement, api } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import getCurrentAccount from '@salesforce/apex/WebsuiteAccountAuthController.getCurrentAccount';
import getMySites from '@salesforce/apex/WebsuiteAccountAuthController.getMySites';
import logoutApex from '@salesforce/apex/WebsuiteAccountAuthController.logout';
import { loadWebsuiteStyles, openLoginModal, getStoredAccountSession, clearStoredAccountSession } from 'c/websuiteStyles';

export default class WebsuiteAccountPage extends NavigationMixin(LightningElement) {
    @api heading = 'Your account';
    @api emptyStateText = "You haven't started a site yet.";

    stylesLoaded = false;
    loading = true;
    session; // { accountId, firstName, lastName, email }
    sites = [];

    get isLoggedIn() {
        return !!this.session;
    }
    get isLoggedOut() {
        return !this.loading && !this.session;
    }
    get fullName() {
        if (!this.session) {
            return '';
        }
        return [this.session.firstName, this.session.lastName].filter(Boolean).join(' ');
    }
    get hasSites() {
        return this.sites.length > 0;
    }

    connectedCallback() {
        this.load();
    }

    renderedCallback() {
        if (this.stylesLoaded) {
            return;
        }
        this.stylesLoaded = true;
        loadWebsuiteStyles(this).catch((error) => {

            console.error('websuiteAccountPage: failed to load shared styles', error);
        });
    }

    load() {
        const stored = getStoredAccountSession();
        if (!stored || !stored.accountId || !stored.token) {
            this.loading = false;
            return;
        }
        this.loading = true;
        getCurrentAccount({ accountId: stored.accountId, sessionToken: stored.token })
            .then((session) => {
                if (!session) {
                    clearStoredAccountSession();
                    this.session = undefined;
                    return undefined;
                }
                this.session = session;
                return getMySites({ accountId: session.accountId });
            })
            .then((rows) => {
                this.sites = (rows || []).map((s) => ({
                    id: s.id,
                    name: s.name,
                    statusLabel: s.isPublished ? 'Published' : 'Draft',
                    actionLabel: s.isPublished ? 'Edit' : 'Continue'
                }));
            })
            .catch(() => {
                this.session = undefined;
                this.sites = [];
            })
            .finally(() => {
                this.loading = false;
            });
    }

    handleLogin() {
        openLoginModal();
    }

    handleLogout() {
        const stored = getStoredAccountSession();
        clearStoredAccountSession();
        this.session = undefined;
        this.sites = [];
        if (stored && stored.accountId && stored.token) {
            logoutApex({ accountId: stored.accountId, sessionToken: stored.token }).catch(() => {
                // Best-effort server-side invalidation — the local session is already cleared either way.
            });
        }
    }

    handleOpenEditor() {
        this[NavigationMixin.Navigate]({
            type: 'standard__webPage',
            attributes: { url: '/editor' }
        });
    }

    // Deep-links into a specific saved site rather than the blank/new-site
    // path handleOpenEditor takes — recordId is the Editor route's existing
    // {!recordId} page-property binding (siteEditorShell.js-meta.xml), so
    // passing it as a URL query param is enough for the editor to load this
    // site instead of starting empty.
    handleEditSite(event) {
        const siteId = event.currentTarget.dataset.siteId;
        this[NavigationMixin.Navigate]({
            type: 'standard__webPage',
            attributes: { url: `/editor?recordId=${siteId}` }
        });
    }
}
