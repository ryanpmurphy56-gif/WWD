import { LightningElement, track } from 'lwc';
// FIX: switched from SelfRegController to AuthControllerV2
// SelfRegController: wrong profile name 'Customer Community User' (should be 'Store Member'),
// hardcoded birthdate '2000-01-01' and phone '0400000000', no birthdate/phone collection
import loginUser      from '@salesforce/apex/AuthControllerV2.loginUser';
import registerUser   from '@salesforce/apex/AuthControllerV2.registerUser';
import forgotPassword from '@salesforce/apex/AuthControllerV2.forgotPassword';

export default class PnpV2MemberAuth extends LightningElement {
    @track mode           = 'signin'; // 'signin' | 'register' | 'forgot'
    @track isLoading      = false;
    @track errorMessage   = '';
    @track successMessage = '';

    // Sign in
    @track loginEmail    = '';
    @track loginPassword = '';

    // Forgot password
    @track forgotEmail = '';

    // Registration (FIX: birthdate + phone instead of password fields)
    @track firstName   = '';
    @track lastName    = '';
    @track registerEmail = '';
    @track birthdate   = '';
    @track phoneNumber = '';
    @track registerPassword        = '';
    @track registerPasswordConfirm = '';

    get isSignInMode()   { return this.mode === 'signin'; }
    get isRegisterMode() { return this.mode === 'register'; }
    get isForgotMode()   { return this.mode === 'forgot'; }

    get signInTabClass() { return this.isSignInMode ? 'tab-btn active' : 'tab-btn'; }
    get createTabClass() { return this.isRegisterMode ? 'tab-btn active' : 'tab-btn'; }

    clearMessages() { this.errorMessage = ''; this.successMessage = ''; }
    showSignIn()         { this.mode = 'signin';   this.clearMessages(); }
    showCreateAccount()  { this.mode = 'register'; this.clearMessages(); }
    showForgotPassword() { this.mode = 'forgot';   this.clearMessages(); }

    handleForgotEmailChange(event)   { this.forgotEmail   = event.target.value; }
    handleLoginEmailChange(event)    { this.loginEmail    = event.target.value; }
    handleLoginPasswordChange(event) { this.loginPassword = event.target.value; }
    handleFirstNameChange(event)     { this.firstName     = event.target.value; }
    handleLastNameChange(event)      { this.lastName      = event.target.value; }
    handleRegisterEmailChange(event) { this.registerEmail = event.target.value; }
    handleBirthdateChange(event)     { this.birthdate     = event.target.value; }
    handlePhoneChange(event)           { this.phoneNumber             = event.target.value; }
    handleRegisterPasswordChange(event){ this.registerPassword        = event.target.value; }
    handleRegisterConfirmChange(event) { this.registerPasswordConfirm = event.target.value; }

    handleLogin() {
        this.clearMessages();
        if (!this.loginEmail || !this.loginPassword) {
            this.errorMessage = 'Please enter your email address and password.';
            return;
        }
        this.isLoading = true;
        loginUser({ email: this.loginEmail, password: this.loginPassword })
            .then((url) => { if (url) window.location.href = url; })
            .catch((error) => {
                this.errorMessage = this._extractError(error, 'Login failed. Please check your email and password.');
            })
            .finally(() => { this.isLoading = false; });
    }

    handleForgotSubmit() {
        this.clearMessages();
        const email = (this.forgotEmail || this.loginEmail || '').trim();
        if (!email) {
            this.errorMessage = 'Please enter your email address.';
            return;
        }
        this.isLoading = true;
        forgotPassword({ email })
            .then(() => {
                // Always report success — the server never reveals whether the email exists
                this.successMessage =
                    'If an account exists for ' + email + ', a password reset link has been sent. ' +
                    'Check your spam folder if it does not arrive within a few minutes.';
            })
            .catch((error) => {
                this.errorMessage = this._extractError(error, 'Could not send the reset email. Please try again.');
            })
            .finally(() => { this.isLoading = false; });
    }

    handleRegister() {
        this.clearMessages();
        if (!this.firstName || !this.lastName || !this.registerEmail || !this.birthdate || !this.phoneNumber || !this.registerPassword) {
            this.errorMessage = 'Please complete all required fields.';
            return;
        }
        if (this.registerPassword.length < 8) {
            this.errorMessage = 'Your password must be at least 8 characters.';
            return;
        }
        if (this.registerPassword !== this.registerPasswordConfirm) {
            this.errorMessage = 'Passwords do not match.';
            return;
        }

        // Client-side age check (also validated server-side)
        const dob = new Date(this.birthdate);
        const age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
        if (age < 18) {
            this.errorMessage = 'You must be 18 or older to create an account.';
            return;
        }

        this.isLoading = true;
        registerUser({
            firstName:   this.firstName,
            lastName:    this.lastName,
            email:       this.registerEmail,
            birthdate:   this.birthdate,
            phoneNumber: this.phoneNumber,
            password:    this.registerPassword
        })
            .then((result) => {
                if (result && result !== 'SUCCESS') {
                    // Frontdoor URL — follow it to complete the auto-login
                    window.location.href = result;
                } else {
                    this.successMessage = 'Account created! Sign in with your email and password.';
                    this.isSignInMode = true;
                    this.loginEmail   = this.registerEmail;
                }
            })
            .catch((error) => {
                this.errorMessage = this._extractError(error, 'Registration failed. Please try again.');
            })
            .finally(() => { this.isLoading = false; });
    }

    _extractError(error, fallback) {
        if (error?.body) {
            if (Array.isArray(error.body) && error.body[0]?.message) return error.body[0].message;
            if (error.body.message) return error.body.message;
        }
        return error?.message || fallback;
    }
}