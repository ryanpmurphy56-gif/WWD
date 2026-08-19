/**
 * siteMarketing — the site-wide announcement bar and promo popup, both driven
 * by config.marketing. Mounted once by siteEditorShell, only outside edit
 * mode (a visitor-facing overlay has no business appearing while the author
 * is working on content underneath it).
 *
 * One popup, not a list: covers the common "one site-wide promo" case
 * without needing list-management UI. Dismissal is remembered per-browser
 * (announcement bar: sessionStorage, cleared per session; popup:
 * localStorage, honours dismissDays) so a visitor isn't nagged on every page.
 */
import { LightningElement, api } from 'lwc';

const BAR_DISMISS_KEY = 'websuiteAnnouncementDismissed';
const POPUP_DISMISS_KEY = 'websuitePopupDismissedAt';
const DEFAULT_DISMISS_DAYS = 7;

export default class SiteMarketing extends LightningElement {
    @api config = {};

    barDismissed = false;
    popupVisible = false;
    popupArmed = false;

    _scrollHandler;
    _exitHandler;
    _delayTimer;

    connectedCallback() {
        try {
            this.barDismissed = window.sessionStorage.getItem(BAR_DISMISS_KEY) === '1';
        } catch {
            this.barDismissed = false;
        }
    }

    disconnectedCallback() {
        this._teardownPopupListeners();
        window.clearTimeout(this._delayTimer);
    }

    renderedCallback() {
        this._armPopup();
    }

    get marketing() {
        return this.config?.marketing || {};
    }

    // ---- announcement bar --------------------------------------------------
    get bar() {
        return this.marketing.announcementBar || {};
    }
    get showBar() {
        return !!this.bar.enabled && !!this.bar.text && !this.barDismissed;
    }
    get barHasCta() {
        return !!(this.bar.ctaLabel && this.bar.ctaTarget);
    }
    get barDismissible() {
        return this.bar.dismissible !== false;
    }

    handleDismissBar() {
        this.barDismissed = true;
        try {
            window.sessionStorage.setItem(BAR_DISMISS_KEY, '1');
        } catch {
            // sessionStorage unavailable (private browsing etc.) — dismissal
            // just won't persist across a reload, not worth failing over.
        }
    }

    // ---- popup ---------------------------------------------------------------
    get popup() {
        return this.marketing.popup || {};
    }
    get popupEligible() {
        return !!this.popup.enabled && !!this.popup.heading;
    }
    get popupHasCta() {
        return !!(this.popup.ctaLabel && this.popup.ctaTarget);
    }

    _isRecentlyDismissed() {
        let dismissedAt;
        try {
            dismissedAt = Number(window.localStorage.getItem(POPUP_DISMISS_KEY));
        } catch {
            return false;
        }
        if (!dismissedAt) {
            return false;
        }
        const days = Number(this.popup.dismissDays) || DEFAULT_DISMISS_DAYS;
        return Date.now() - dismissedAt < days * 24 * 60 * 60 * 1000;
    }

    _armPopup() {
        if (this.popupArmed || !this.popupEligible || this._isRecentlyDismissed()) {
            return;
        }
        this.popupArmed = true;
        const trigger = this.popup.trigger || 'delay';
        if (trigger === 'scroll') {
            this._scrollHandler = () => this._checkScroll();
            window.addEventListener('scroll', this._scrollHandler, { passive: true });
        } else if (trigger === 'exit') {
            this._exitHandler = (e) => {
                if (e.clientY <= 0) {
                    this._showPopup();
                }
            };
            document.addEventListener('mouseout', this._exitHandler);
        } else {
            const seconds = Number(this.popup.delaySeconds) || 5;
            // eslint-disable-next-line @lwc/lwc/no-async-operation -- one-shot marketing trigger, torn down on disconnect
            this._delayTimer = window.setTimeout(() => this._showPopup(), seconds * 1000);
        }
    }

    _checkScroll() {
        const pct = Number(this.popup.scrollPercent) || 50;
        const scrolled = window.scrollY + window.innerHeight;
        const full = document.documentElement.scrollHeight;
        if (full > 0 && (scrolled / full) * 100 >= pct) {
            this._showPopup();
        }
    }

    _showPopup() {
        this.popupVisible = true;
        this._teardownPopupListeners();
    }

    _teardownPopupListeners() {
        if (this._scrollHandler) {
            window.removeEventListener('scroll', this._scrollHandler);
            this._scrollHandler = null;
        }
        if (this._exitHandler) {
            document.removeEventListener('mouseout', this._exitHandler);
            this._exitHandler = null;
        }
        window.clearTimeout(this._delayTimer);
    }

    handleDismissPopup() {
        this.popupVisible = false;
        try {
            window.localStorage.setItem(POPUP_DISMISS_KEY, String(Date.now()));
        } catch {
            // localStorage unavailable — dismissal just won't persist, not fatal.
        }
    }

    stop(event) {
        event.stopPropagation();
    }
}