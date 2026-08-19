/**
 * Shared GSAP loader + entrance-animation helpers.
 * Usage from a component:
 *   import { fadeUpIn } from 'c/pnpGsap';
 *   renderedCallback() { fadeUpIn(this, '.card', { stagger: 0.06 }); }
 * Helpers no-op gracefully if GSAP fails to load, so pages never break.
 */
import { loadScript } from 'lightning/platformResourceLoader';
import GSAP from '@salesforce/resourceUrl/gsap';

let gsapPromise;

export function ensureGsap(cmp) {
    if (!gsapPromise) {
        gsapPromise = loadScript(cmp, GSAP)
            .then(() => window.gsap)
            .catch(() => null);
    }
    return gsapPromise;
}

/** Fade + rise elements into place, optionally staggered. Runs once per element. */
export function fadeUpIn(cmp, selector, opts = {}) {
    return ensureGsap(cmp).then((gsap) => {
        if (!gsap) return;
        const els = Array.from(cmp.template.querySelectorAll(selector))
            .filter((el) => !el.dataset.pnpAnimated);
        if (!els.length) return;
        els.forEach((el) => { el.dataset.pnpAnimated = '1'; });
        gsap.fromTo(
            els,
            { opacity: 0, y: 26 },
            {
                opacity: 1,
                y: 0,
                duration: opts.duration ?? 0.55,
                ease: 'power2.out',
                stagger: opts.stagger ?? 0,
                delay: opts.delay ?? 0,
                clearProps: 'opacity,transform'
            }
        );
    });
}

/** Slide a panel in from the right (cart drawer style). */
export function slideInRight(cmp, selector, opts = {}) {
    return ensureGsap(cmp).then((gsap) => {
        if (!gsap) return;
        const el = cmp.template.querySelector(selector);
        if (!el) return;
        gsap.fromTo(
            el,
            { x: 60, opacity: 0 },
            {
                x: 0,
                opacity: 1,
                duration: opts.duration ?? 0.4,
                ease: 'power3.out',
                clearProps: 'opacity,transform'
            }
        );
    });
}

/**
 * Repeatable attention bounce (e.g. the header cart button when an item is
 * added). Unlike the entrance helpers this can fire any number of times.
 */
export function bounce(cmp, selector, opts = {}) {
    return ensureGsap(cmp).then((gsap) => {
        if (!gsap) return;
        const el = cmp.template.querySelector(selector);
        if (!el) return;
        gsap.killTweensOf(el); // rapid adds restart the pop instead of stacking
        gsap.fromTo(
            el,
            { scale: 1 },
            {
                scale: opts.scale ?? 1.22,
                duration: opts.duration ?? 0.16,
                ease: 'power2.out',
                yoyo: true,
                repeat: 1,
                clearProps: 'transform'
            }
        );
    });
}

/** Gentle scale-pop for a single element (e.g. member card reveal). */
export function popIn(cmp, selector, opts = {}) {
    return ensureGsap(cmp).then((gsap) => {
        if (!gsap) return;
        const el = cmp.template.querySelector(selector);
        if (!el || el.dataset.pnpAnimated) return;
        el.dataset.pnpAnimated = '1';
        gsap.fromTo(
            el,
            { opacity: 0, scale: 0.94 },
            {
                opacity: 1,
                scale: 1,
                duration: opts.duration ?? 0.5,
                ease: 'back.out(1.4)',
                delay: opts.delay ?? 0,
                clearProps: 'opacity,transform'
            }
        );
    });
}