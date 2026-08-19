/**
 * sectionMemberLogin — passwordless email-code login/signup for a site
 * (WebsuiteMemberAuthController). Like blogList/shop this is "dynamic" —
 * it talks to Apex rather than rendering purely from `content` — but unlike
 * those read-only CMS sections this one performs writes (creates a member,
 * issues codes, mints a session), so it never runs its real flow in the
 * editor: `mode==='edit'` renders a static, non-interactive preview instead
 * (see isEdit below) so dragging this block onto a canvas or editing its
 * heading never creates guest data.
 *
 * Session shape kept in localStorage is deliberately NOT just the member Id
 * (unlike a naive "store the record Id" approach) — it's {memberId, token},
 * where token is a random opaque value whose SHA-256 hash is the only thing
 * persisted server-side (Websuite_Site_Member__c.Session_Token_Hash__c).
 * getCurrentMember() re-validates that pair against the server on every
 * return visit; a copied localStorage value alone proves nothing without it.
 */
import { LightningElement, api } from 'lwc';
import requestLoginCode from '@salesforce/apex/WebsuiteMemberAuthController.requestLoginCode';
import signUpAndSendCode from '@salesforce/apex/WebsuiteMemberAuthController.signUpAndSendCode';
import verifyLoginCode from '@salesforce/apex/WebsuiteMemberAuthController.verifyLoginCode';
import getCurrentMember from '@salesforce/apex/WebsuiteMemberAuthController.getCurrentMember';
import logoutApex from '@salesforce/apex/WebsuiteMemberAuthController.logout';
import { sectionRootClass, sectionRootStyle, fieldStyle, commitField } from 'c/sectionCommon';

const STORAGE_PREFIX = 'websuite_member_';

export default class SectionMemberLogin extends LightningElement {
    @api content = {};
    @api sectionStyle = {};
    @api variant = 'card';
    @api layout = {};
    @api mode = 'live';
    @api siteId;

    screen = 'email'; // 'email' | 'name' | 'code' | 'loggedIn'
    emailValue = '';
    firstNameValue = '';
    lastNameValue = '';
    phoneValue = '';
    codeValue = '';
    maskedEmail = '';
    loading = false;
    errorMessage = '';
    session; // { memberId, firstName, lastName, email }

    _checkedFor;

    get isEdit() {
        return this.mode === 'edit';
    }
    get rootClass() {
        return sectionRootClass('sec_memberlogin', {
            variant: this.variant,
            style: this.sectionStyle,
            layout: this.layout,
            mode: this.mode
        });
    }
    get rootStyle() {
        return sectionRootStyle(this.sectionStyle);
    }
    get headingFieldStyle() {
        return fieldStyle(this.sectionStyle?.fields, 'heading');
    }
    get heading() {
        return this.content?.heading || '';
    }
    get subheading() {
        return this.content?.subheading || '';
    }
    get welcomeText() {
        return this.content?.welcomeText || 'Welcome back';
    }
    get editableAttr() {
        return this.isEdit ? 'true' : 'false';
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
    get isLoggedIn() {
        return this.screen === 'loggedIn';
    }
    get memberFullName() {
        if (!this.session) {
            return '';
        }
        return [this.session.firstName, this.session.lastName].filter(Boolean).join(' ');
    }
    get hasError() {
        return !!this.errorMessage;
    }

    renderedCallback() {
        if (this.isEdit || !this.siteId || this.siteId === this._checkedFor) {
            return;
        }
        this._checkedFor = this.siteId;
        this.restoreSession();
    }

    storageKey() {
        return STORAGE_PREFIX + this.siteId;
    }

    readStoredSession() {
        try {
            const raw = window.localStorage.getItem(this.storageKey());
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }
    writeStoredSession(memberId, token) {
        try {
            window.localStorage.setItem(this.storageKey(), JSON.stringify({ memberId, token }));
        } catch (e) {
            // Storage unavailable (private browsing, quota) — session just won't persist across reloads.
        }
    }
    clearStoredSession() {
        try {
            window.localStorage.removeItem(this.storageKey());
        } catch (e) {
            // Nothing to clean up if storage was never usable.
        }
    }

    restoreSession() {
        const stored = this.readStoredSession();
        if (!stored || !stored.memberId || !stored.token) {
            return;
        }
        this.loading = true;
        getCurrentMember({ siteId: this.siteId, memberId: stored.memberId, sessionToken: stored.token })
            .then((session) => {
                if (session) {
                    this.session = session;
                    this.screen = 'loggedIn';
                } else {
                    this.clearStoredSession();
                }
            })
            .catch(() => {
                this.clearStoredSession();
            })
            .finally(() => {
                this.loading = false;
            });
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
            event.target.blur ? event.target.blur() : null;
        }
    }
    handleHeadingEdit(event) {
        commitField(this, event, this.content);
    }
    handleSubheadingEdit(event) {
        commitField(this, event, this.content);
    }

    handleEmailSubmit() {
        this.errorMessage = '';
        const email = (this.emailValue || '').trim();
        if (!email) {
            this.errorMessage = 'Please enter your email address.';
            return;
        }
        this.loading = true;
        requestLoginCode({ siteId: this.siteId, email })
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
            siteId: this.siteId,
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
        verifyLoginCode({ siteId: this.siteId, email: (this.emailValue || '').trim(), code })
            .then((session) => {
                this.session = session;
                this.writeStoredSession(session.memberId, session.sessionToken);
                this.screen = 'loggedIn';
                this.codeValue = '';
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
        requestLoginCode({ siteId: this.siteId, email: (this.emailValue || '').trim() })
            .then((result) => {
                // NAME_REQUIRED shouldn't happen on a resend (the member already
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

    handleLogout() {
        const stored = this.readStoredSession();
        this.clearStoredSession();
        this.session = undefined;
        this.screen = 'email';
        this.emailValue = '';
        this.firstNameValue = '';
        this.lastNameValue = '';
        this.phoneValue = '';
        this.codeValue = '';
        this.maskedEmail = '';
        if (stored && stored.memberId && stored.token) {
            logoutApex({ siteId: this.siteId, memberId: stored.memberId, sessionToken: stored.token }).catch(() => {
                // Best-effort server-side invalidation — the local session is already cleared either way.
            });
        }
    }

    extractError(e) {
        return (e && e.body && e.body.message) || 'Something went wrong. Please try again.';
    }
}
