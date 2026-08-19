import { LightningElement, wire, track } from 'lwc';
import getCurrentMemberProfile from '@salesforce/apex/PnpV2MemberController.getCurrentMemberProfile';
import changePassword from '@salesforce/apex/AuthControllerV2.changePassword';
import requestPasswordResetCode from '@salesforce/apex/AuthControllerV2.requestPasswordResetCode';
import resetPasswordWithCode from '@salesforce/apex/AuthControllerV2.resetPasswordWithCode';

export default class PnpV2AccountPanel extends LightningElement {
    @track profile;

    @track showPasswordForm = false;
    @track pwSaving  = false;
    @track pwError   = '';
    @track pwSuccess = '';

    oldPassword = '';
    newPassword = '';
    confirmPassword = '';

    // ── Forgot-current-password (verification code) flow ──
    @track resetMode    = false;
    @track resetStep    = 'request';   // 'request' | 'verify'
    @track resetBusy    = false;
    @track resetError   = '';
    @track resetSuccess = '';
    resetCode = '';
    resetNewPassword = '';
    resetConfirmPassword = '';

    get showChangeForm() { return this.showPasswordForm && !this.resetMode; }
    get showVerifyStep() { return this.resetStep === 'verify'; }

    @wire(getCurrentMemberProfile)
    wiredProfile({ data, error }) {
        if (data) { this.profile = data; }
        else if (error) { console.error('Profile load error:', error); }
    }

    togglePasswordForm() {
        this.showPasswordForm = !this.showPasswordForm;
        this._clearChangeFields();
        this._exitReset();
        this.pwSuccess = '';
    }

    _clearChangeFields() {
        this.pwError = '';
        this.oldPassword = '';
        this.newPassword = '';
        this.confirmPassword = '';
    }

    handlePwField(event) {
        this[event.target.dataset.field] = event.target.value;
    }

    handleChangePassword() {
        this.pwError = '';
        this.pwSuccess = '';
        if (!this.oldPassword || !this.newPassword || !this.confirmPassword) {
            this.pwError = 'Please fill in all password fields.';
            return;
        }
        if (this.newPassword !== this.confirmPassword) {
            this.pwError = 'New passwords do not match.';
            return;
        }
        this.pwSaving = true;
        changePassword({
            oldPassword: this.oldPassword,
            newPassword: this.newPassword,
            confirmPassword: this.confirmPassword
        })
            .then(() => {
                this.pwSuccess = 'Password updated. Use it next time you sign in.';
                this.oldPassword = '';
                this.newPassword = '';
                this.confirmPassword = '';
                this.template.querySelectorAll('.password-form input').forEach((el) => { el.value = ''; });
            })
            .catch((error) => {
                this.pwError = error?.body?.message || 'Password change failed. Please try again.';
            })
            .finally(() => { this.pwSaving = false; });
    }

    // ── Reset-via-code handlers ──
    startReset() {
        this.resetMode = true;
        this.resetStep = 'request';
        this._exitResetFields();
        this.pwError = '';
        this.pwSuccess = '';
    }

    cancelReset() {
        this._exitReset();
    }

    _exitReset() {
        this.resetMode = false;
        this.resetStep = 'request';
        this._exitResetFields();
    }

    _exitResetFields() {
        this.resetError = '';
        this.resetSuccess = '';
        this.resetCode = '';
        this.resetNewPassword = '';
        this.resetConfirmPassword = '';
    }

    handleResetField(event) {
        this[event.target.dataset.field] = event.target.value;
    }

    requestCode() {
        this.resetError = '';
        this.resetSuccess = '';
        this.resetBusy = true;
        requestPasswordResetCode({ channel: 'email' })
            .then((maskedDestination) => {
                this.resetStep = 'verify';
                this.resetSuccess =
                    `We sent a 6-digit code to ${maskedDestination}. It expires in 10 minutes.`;
            })
            .catch((error) => {
                this.resetError = error?.body?.message || 'Could not send a code. Please try again.';
            })
            .finally(() => { this.resetBusy = false; });
    }

    resendCode() {
        this.requestCode();
    }

    submitReset() {
        this.resetError = '';
        if (!this.resetCode || !this.resetNewPassword || !this.resetConfirmPassword) {
            this.resetError = 'Please enter the code and your new password.';
            return;
        }
        if (this.resetNewPassword !== this.resetConfirmPassword) {
            this.resetError = 'New passwords do not match.';
            return;
        }
        this.resetBusy = true;
        resetPasswordWithCode({
            code: this.resetCode,
            newPassword: this.resetNewPassword,
            confirmPassword: this.resetConfirmPassword
        })
            .then(() => {
                this._exitReset();
                this.showPasswordForm = false;
                this.pwSuccess = 'Password updated. Use it next time you sign in.';
            })
            .catch((error) => {
                this.resetError = error?.body?.message || 'Could not reset your password. Please try again.';
            })
            .finally(() => { this.resetBusy = false; });
    }

    handleLogout() {
        window.location.href = '/secur/logout.jsp';
    }
}