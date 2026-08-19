import { LightningElement, track } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import registerUser from '@salesforce/apex/SelfRegController.registerUser';
import loginUser from '@salesforce/apex/SelfRegController.loginUser';
import LOGO_RESOURCE from '@salesforce/resourceUrl/pointnpourlogo';

export default class LoginPage extends NavigationMixin(LightningElement) {
    @track activeTab = 'login'; // 'login' or 'register'
    @track isLoading = false;
    @track errorMessage = '';
    @track successMessage = '';

    logoUrl = LOGO_RESOURCE;

    // Login fields
    @track loginEmail = '';
    @track loginPassword = '';

    // Register fields
    @track regFirstName = '';
    @track regLastName = '';
    @track regEmail = '';
    @track regPassword = '';
    @track regConfirmPassword = '';

    get isLoginTab() { return this.activeTab === 'login'; }
    get isRegisterTab() { return this.activeTab === 'register'; }
    get loginTabClass() { return 'tab-btn' + (this.isLoginTab ? ' active' : ''); }
    get registerTabClass() { return 'tab-btn' + (this.isRegisterTab ? ' active' : ''); }

    showLogin() {
        this.activeTab = 'login';
        this.errorMessage = '';
        this.successMessage = '';
    }

    showRegister() {
        this.activeTab = 'register';
        this.errorMessage = '';
        this.successMessage = '';
    }

    handleLoginEmailChange(e) { this.loginEmail = e.target.value; }
    handleLoginPasswordChange(e) { this.loginPassword = e.target.value; }
    handleFirstNameChange(e) { this.regFirstName = e.target.value; }
    handleLastNameChange(e) { this.regLastName = e.target.value; }
    handleRegEmailChange(e) { this.regEmail = e.target.value; }
    handleRegPasswordChange(e) { this.regPassword = e.target.value; }
    handleConfirmPasswordChange(e) { this.regConfirmPassword = e.target.value; }

    handleLoginKeyUp(e) {
        if (e.key === 'Enter') this.handleLogin();
    }

    handleLogin() {
        this.errorMessage = '';
        if (!this.loginEmail || !this.loginPassword) {
            this.errorMessage = 'Please enter your email and password.';
            return;
        }
        this.isLoading = true;
        loginUser({ email: this.loginEmail, password: this.loginPassword })
            .then(redirectUrl => {
                window.location.href = redirectUrl || '/';
            })
            .catch(error => {
                this.errorMessage = error.body ? error.body.message : 'Login failed. Please try again.';
                this.isLoading = false;
            });
    }

    handleRegister() {
        this.errorMessage = '';
        this.successMessage = '';
        this.isLoading = true;

        registerUser({
            firstName: this.regFirstName,
            lastName: this.regLastName,
            email: this.regEmail,
            password: this.regPassword,
            confirmPassword: this.regConfirmPassword
        })
            .then(result => {
                if (result === 'SUCCESS') {
                    this.successMessage = 'Account created! Your membership card has been generated. Please log in.';
                    this.activeTab = 'login';
                    this.loginEmail = this.regEmail;
                }
                this.isLoading = false;
            })
            .catch(error => {
                this.errorMessage = error.body ? error.body.message : 'Registration failed. Please try again.';
                this.isLoading = false;
            });
    }
}