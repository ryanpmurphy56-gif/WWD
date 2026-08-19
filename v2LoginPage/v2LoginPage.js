import { LightningElement, track } from 'lwc';
import loginUser from '@salesforce/apex/AuthControllerV2.loginUser';
import registerUser from '@salesforce/apex/AuthControllerV2.registerUser';

export default class V2LoginPage extends LightningElement {
    @track isSignInMode = true;
    @track isLoading = false;
    @track registrationComplete = false;

    @track loginEmail = '';
    @track loginPassword = '';

    @track firstName = '';
    @track lastName = '';
    @track registerEmail = '';
    @track birthdate = '';
    @track phoneNumber = '';
    @track registerPassword = '';
    @track registerPasswordConfirm = '';

    @track errorMessage = '';
    @track successMessage = '';

    get signInTabClass() {
        return this.isSignInMode ? 'tab-btn active' : 'tab-btn';
    }

    get createTabClass() {
        return this.isSignInMode ? 'tab-btn' : 'tab-btn active';
    }

    clearMessages() {
        this.errorMessage = '';
        this.successMessage = '';
    }

    showSignIn() {
        this.isSignInMode = true;
        this.registrationComplete = false;
        this.clearMessages();
    }

    showCreateAccount() {
        this.isSignInMode = false;
        this.registrationComplete = false;
        this.clearMessages();
    }

    handleLoginEmailChange(event) { this.loginEmail = event.target.value; }
    handleLoginPasswordChange(event) { this.loginPassword = event.target.value; }
    handleFirstNameChange(event) { this.firstName = event.target.value; }
    handleLastNameChange(event) { this.lastName = event.target.value; }
    handleRegisterEmailChange(event) { this.registerEmail = event.target.value; }
    handleBirthdateChange(event) { this.birthdate = event.target.value; }
    handlePhoneNumberChange(event) { this.phoneNumber = event.target.value; }
    handleRegisterPasswordChange(event) { this.registerPassword = event.target.value; }
    handleRegisterPasswordConfirmChange(event) { this.registerPasswordConfirm = event.target.value; }

    handleLogin() {
        this.clearMessages();

        if (!this.loginEmail || !this.loginPassword) {
            this.errorMessage = 'Please enter your email address and password.';
            return;
        }

        this.isLoading = true;

        loginUser({
            email: this.loginEmail,
            password: this.loginPassword
        })
            .then((redirectUrl) => {
                window.location.href = redirectUrl || '/';
            })
            .catch((error) => {
                this.errorMessage = this.extractErrorMessage(
                    error,
                    'Login failed. Please check your email and password.'
                );
            })
            .finally(() => {
                this.isLoading = false;
            });
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

        this.isLoading = true;

        registerUser({
            firstName: this.firstName,
            lastName: this.lastName,
            email: this.registerEmail,
            birthdate: this.birthdate,
            phoneNumber: this.phoneNumber,
            password: this.registerPassword
        })
            .then((result) => {
                if (result && result !== 'SUCCESS') {
                    // Frontdoor URL — follow it to complete the auto-login
                    window.location.href = result;
                } else {
                    // Account created but auto-login unavailable — send them to sign in
                    this.registrationComplete = true;
                    this.loginEmail = this.registerEmail;
                }
            })
            .catch((error) => {
                this.errorMessage = this.extractErrorMessage(
                    error,
                    'Registration failed. Please try again.'
                );
            })
            .finally(() => {
                this.isLoading = false;
            });
    }

    extractErrorMessage(error, fallbackMessage) {
        if (error && error.body) {
            if (Array.isArray(error.body) && error.body.length > 0 && error.body[0].message) {
                return error.body[0].message;
            }
            if (error.body.message) return error.body.message;
        }
        if (error && error.message) return error.message;
        return fallbackMessage;
    }
}