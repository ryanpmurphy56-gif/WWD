/**
 * websuiteLoginModal — passwordless email-code login/signup for a WebSuite
 * customer's own platform account (WebsuiteAccountAuthController), opened
 * from websuiteHeader's "Log in" button via the same window-event bus
 * websuiteWizard uses (see websuiteStyles.OPEN_LOGIN_EVENT — Experience
 * Builder places sections as siblings, so DOM bubbling can't reach this).
 *
 * On success, stores {accountId, token} via setStoredAccountSession (never
 * the bare account Id alone — see websuiteStyles.js), which also broadcasts
 * ACCOUNT_SESSION_CHANGED_EVENT so websuiteHeader updates without a reload,
 * then navigates to the Account page.
 */
import { LightningElement } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import requestLoginCode from '@salesforce/apex/WebsuiteAccountAuthController.requestLoginCode';
import signUpAndSendCode from '@salesforce/apex/WebsuiteAccountAuthController.signUpAndSendCode';
import verifyLoginCode from '@salesforce/apex/WebsuiteAccountAuthController.verifyLoginCode';
import { loadWebsuiteStyles, OPEN_LOGIN_EVENT, setStoredAccountSession } from 'c/websuiteStyles';

export default class WebsuiteLoginModal extends NavigationMixin(LightningElement) {
    stylesLoaded = false;
    isOpen = false;
    screen = 'email'; // 'email' | 'name' | 'code'
    emailValue = '';
    firstNameValue = '';
    lastNameValue = '';
    phoneValue = '';
    codeValue = '';
    maskedEmail = '';
    loading = false;
    errorMessage = '';

    connectedCallback() {
        this.boundOpen = () => this.open();
        window.addEventListener(OPEN_LOGIN_EVENT, this.boundOpen);
    }

    disconnectedCallback() {
        window.removeEventListener(OPEN_LOGIN_EVENT, this.boundOpen);
    }

    renderedCallback() {
        if (this.stylesLoaded) {
            return;
        }
        this.stylesLoaded = true;
        loadWebsuiteStyles(this).catch((error) => {

            console.error('websuiteLoginModal: failed to load shared styles', error);
        });
    }

    open() {
        this.isOpen = true;
        this.screen = 'email';
        this.emailValue = '';
        this.firstNameValue = '';
        this.lastNameValue = '';
        this.phoneValue = '';
        this.codeValue = '';
        this.maskedEmail = '';
        this.errorMessage = '';
    }

    handleClose() {
        this.isOpen = false;
    }

    // Only closes when the backdrop itself (not something inside the card) was clicked.
    handleBackdropClick(event) {
        if (event.target === event.currentTarget) {
            this.handleClose();
        }
    }

    get isEmailScreen() {
        return this.screen === 'email';
    }
    get isNameScreen() {
        return this.screen === 'name';
    }
    get isCodeScreen() {
        return this.screen === 'code';
    }
    get hasError() {
        return !!this.errorMessage;
    }

    handleEmailInput(event) {
        this.emailValue = event.target.value;
    }
    handleFirstNameInput(event) {
        this.firstNameValue = event.target.value;
    }
    handleLastNameInput(event) {
        this.lastNameValue = event.target.value;
    }
    handlePhoneInput(event) {
        this.phoneValue = event.target.value;
    }
    handleCodeInput(event) {
        this.codeValue = event.target.value.toUpperCase();
    }
    handleKeydown(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            if (event.target.blur) {
                event.target.blur();
            }
        }
    }

    handleEmailSubmit() {
        this.errorMessage = '';
        const email = (this.emailValue || '').trim();
        if (!email) {
            this.errorMessage = 'Please enter your email address.';
            return;
        }
        this.loading = true;
        requestLoginCode({ email })
            .then((result) => {
                if (result.status === 'NAME_REQUIRED') {
                    this.screen = 'name';
                } else {
                    this.maskedEmail = result.maskedEmail;
                    this.screen = 'code';
                }
            })
            .catch((e) => {
                this.errorMessage = this.extractError(e);
            })
            .finally(() => {
                this.loading = false;
            });
    }

    handleNameSubmit() {
        this.errorMessage = '';
        const first = (this.firstNameValue || '').trim();
        const last = (this.lastNameValue || '').trim();
        if (!first || !last) {
            this.errorMessage = 'Please enter your first and last name.';
            return;
        }
        this.loading = true;
        signUpAndSendCode({
            email: (this.emailValue || '').trim(),
            firstName: first,
            lastName: last,
            phone: (this.phoneValue || '').trim()
        })
            .then((result) => {
                this.maskedEmail = result.maskedEmail;
                this.screen = 'code';
            })
            .catch((e) => {
                this.errorMessage = this.extractError(e);
            })
            .finally(() => {
                this.loading = false;
            });
    }

    handleCodeSubmit() {
        this.errorMessage = '';
        const code = (this.codeValue || '').trim();
        if (!code) {
            this.errorMessage = 'Please enter the code from your email.';
            return;
        }
        this.loading = true;
        verifyLoginCode({ email: (this.emailValue || '').trim(), code })
            .then((session) => {
                setStoredAccountSession(session.accountId, session.sessionToken);
                this.isOpen = false;
                // NOTE: assumes the Account page's URL is /account, matching this
                // codebase's /editor convention — update this if yours differs.
                this[NavigationMixin.Navigate]({
                    type: 'standard__webPage',
                    attributes: { url: '/account' }
                });
            })
            .catch((e) => {
                this.errorMessage = this.extractError(e);
            })
            .finally(() => {
                this.loading = false;
            });
    }

    handleResend() {
        this.errorMessage = '';
        this.loading = true;
        requestLoginCode({ email: (this.emailValue || '').trim() })
            .then((result) => {
                // NAME_REQUIRED shouldn't happen on a resend (the account already
                // exists by this point) — but if it ever does, don't silently leave
                // maskedEmail blank on the code screen with no code actually sent.
                if (result.status === 'NAME_REQUIRED') {
                    this.screen = 'name';
                    this.errorMessage = 'We lost track of your account — please re-enter your details.';
                } else {
                    this.maskedEmail = result.maskedEmail;
                }
            })
            .catch((e) => {
                this.errorMessage = this.extractError(e);
            })
            .finally(() => {
                this.loading = false;
            });
    }

    extractError(e) {
        return (e && e.body && e.body.message) || 'Something went wrong. Please try again.';
    }
}
