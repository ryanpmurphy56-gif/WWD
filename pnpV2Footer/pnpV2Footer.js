import { LightningElement } from 'lwc';
import LOGO_RESOURCE from '@salesforce/resourceUrl/pointnpourlogo';
import isGuestUser from '@salesforce/user/isGuest';

export default class pnpV2Footer extends LightningElement {
    logoUrl = LOGO_RESOURCE;
    isGuest = isGuestUser;

    get currentYear() {
        return new Date().getFullYear();
    }

    handleLogoError(event) {
        event.target.style.display = 'none';
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    _view(view) {
        this.dispatchEvent(new CustomEvent('viewchange', {
            bubbles: true,
            composed: true,
            detail: { view }
        }));
    }

    _family(family) {
        this.dispatchEvent(new CustomEvent('familychange', {
            bubbles: true,
            composed: true,
            detail: { family }
        }));
    }

    // ── Shop ──────────────────────────────────────────────────────────────────

    handleBeer()    { this._view('products'); this._family('Beer');    }
    handleWine()    { this._view('products'); this._family('Wine');    }
    handleSpirits() { this._view('products'); this._family('Spirits'); }
    handleRtd()     { this._view('products'); this._family('RTD');     }
    handleOffers()  { this._view('products'); this._family('offers');  }

    // ── Account ───────────────────────────────────────────────────────────────

    handleSignIn() {
        this._view('login');
    }

    handleProfile() {
        // Guest users get bounced to login, same as header behaviour
        if (this.isGuest) {
            this._view('login');
        } else {
            this._view('memberCard');
        }
    }

    handleCart() {
        this._view('cart');
    }

    // ── Pages ─────────────────────────────────────────────────────────────────

    handleHome() {
        this._view('home');
    }

    handleAboutUs() {
        this._view('aboutUs');
    }
}