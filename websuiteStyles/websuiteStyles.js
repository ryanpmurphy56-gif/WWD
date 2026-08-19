import { loadStyle, loadScript } from 'lightning/platformResourceLoader';
import websuiteTokens from '@salesforce/resourceUrl/websuiteTokens';
import websuiteFonts from '@salesforce/resourceUrl/websuiteFonts';
import websuiteGsap from '@salesforce/resourceUrl/websuiteGsap';

// Window-level event names — Experience Builder places sections as siblings,
// so DOM bubbling can't reach the wizard. Everyone talks through window.
export const OPEN_WIZARD_EVENT = 'websuite-open-wizard';

// Same window-event-bus reasoning, for the platform account login modal
// (websuiteLoginModal) and anyone that needs to react when login/logout
// happens elsewhere on the page (e.g. websuiteHeader updating its button).
export const OPEN_LOGIN_EVENT = 'websuite-open-login';
export const ACCOUNT_SESSION_CHANGED_EVENT = 'websuite-account-session-changed';

const ACCOUNT_SESSION_KEY = 'websuite_account_session';

/**
 * Loads the shared design tokens and the bundled fonts into a component's
 * shadow root. Safe to call from every component; loadStyle dedupes fetches.
 */
export function loadWebsuiteStyles(cmp) {
    return Promise.all([
        loadStyle(cmp, websuiteTokens),
        loadStyle(cmp, websuiteFonts + '/fonts.css')
    ]);
}

/**
 * Loads GSAP core then ScrollTrigger, in that order, and registers the
 * plugin. Resolves with the global gsap object.
 */
export function loadGsap(cmp) {
    return loadScript(cmp, websuiteGsap + '/gsap.min.js')
        .then(() => loadScript(cmp, websuiteGsap + '/ScrollTrigger.min.js'))
        .then(() => {
            const gsap = window.gsap;
            if (gsap && window.ScrollTrigger) {
                gsap.registerPlugin(window.ScrollTrigger);
            }
            return gsap;
        });
}

export function openWizard() {
    window.dispatchEvent(new CustomEvent(OPEN_WIZARD_EVENT));
}

export function openLoginModal() {
    window.dispatchEvent(new CustomEvent(OPEN_LOGIN_EVENT));
}

/**
 * The platform account session, as {accountId, token}, or null if nobody's
 * logged in / storage isn't usable (private browsing, quota). This is the
 * WebSuite-customer-account equivalent of the per-site session helpers in
 * sectionMemberLogin.js — same shape, same reasoning: never store the bare
 * account Id alone, always pair it with an opaque token the server can
 * re-validate (see WebsuiteAccountAuthController.getCurrentAccount).
 */
export function getStoredAccountSession() {
    try {
        const raw = window.localStorage.getItem(ACCOUNT_SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

/** Persists the session and tells the rest of the page it changed. */
export function setStoredAccountSession(accountId, token) {
    try {
        window.localStorage.setItem(ACCOUNT_SESSION_KEY, JSON.stringify({ accountId, token }));
    } catch (e) {
        // Storage unavailable — the session just won't persist across reloads.
    }
    window.dispatchEvent(new CustomEvent(ACCOUNT_SESSION_CHANGED_EVENT));
}

/** Clears the session (logout) and tells the rest of the page it changed. */
export function clearStoredAccountSession() {
    try {
        window.localStorage.removeItem(ACCOUNT_SESSION_KEY);
    } catch (e) {
        // Nothing to clean up if storage was never usable.
    }
    window.dispatchEvent(new CustomEvent(ACCOUNT_SESSION_CHANGED_EVENT));
}

export function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Staggered scroll-in reveal for a set of elements inside a component.
 * Uses IntersectionObserver to trigger (not ScrollTrigger) so elements can
 * never be left invisible if LWR's scroll container confuses GSAP's scroller —
 * IO fires regardless of which ancestor actually scrolls.
 *
 * vars: { y, x, duration, stagger, scale } — all optional.
 */
export function revealOnScroll(cmp, selector, vars = {}) {
    if (prefersReducedMotion()) {
        return Promise.resolve();
    }
    return loadGsap(cmp)
        .then((gsap) => {
            if (!gsap) {
                return;
            }
            const els = Array.from(cmp.template.querySelectorAll(selector));
            if (!els.length) {
                return;
            }
            const y = vars.y === undefined ? 36 : vars.y;
            const x = vars.x || 0;
            const scale = vars.scale === undefined ? 1 : vars.scale;
            const duration = vars.duration === undefined ? 0.8 : vars.duration;
            const stagger = vars.stagger === undefined ? 0.08 : vars.stagger;

            gsap.set(els, { opacity: 0, y, x, scale });
            const io = new IntersectionObserver(
                (entries, observer) => {
                    entries.forEach((entry) => {
                        if (!entry.isIntersecting) {
                            return;
                        }
                        const i = els.indexOf(entry.target);
                        gsap.to(entry.target, {
                            opacity: 1,
                            y: 0,
                            x: 0,
                            scale: 1,
                            duration,
                            delay: (i % 12) * stagger,
                            ease: 'power3.out',
                            overwrite: 'auto'
                        });
                        observer.unobserve(entry.target);
                    });
                },
                { threshold: 0.12 }
            );
            els.forEach((el) => io.observe(el));
        })
        .catch((error) => {

            console.error('websuiteStyles: reveal animation failed (content stays visible)', error);
        });
}