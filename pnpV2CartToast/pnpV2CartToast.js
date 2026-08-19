import { LightningElement, track, api } from 'lwc';
import { ensureGsap } from 'c/pnpGsap';

const SHOW_MS = 3200;

/**
 * Mini "added to cart" toast — a small card showing just the item that was
 * added, sliding in from the right (same motion language as the cart drawer,
 * smaller scale). Auto-dismisses; rapid adds replace the current card.
 */
export default class PnpV2CartToast extends LightningElement {
    @track item = null;
    _hideTimer = null;
    _needsEntrance = false;

    /** Shell calls this with { name, image, qty, priceLabel } on every add. */
    @api
    showItem(added) {
        if (!added || !added.name) return;
        clearTimeout(this._hideTimer);
        this.item = { ...added, qty: added.qty || 1 };
        this._needsEntrance = true; // animate after the card renders
        this._hideTimer = setTimeout(() => this._dismiss(), SHOW_MS);
    }

    renderedCallback() {
        if (!this._needsEntrance) return;
        this._needsEntrance = false;
        const card = this.template.querySelector('.cart-toast');
        if (!card) return;
        ensureGsap(this).then((gsap) => {
            if (!gsap) return;
            gsap.killTweensOf(card);
            gsap.fromTo(
                card,
                { x: 90, opacity: 0, scale: 0.96 },
                { x: 0, opacity: 1, scale: 1, duration: 0.38, ease: 'power3.out', clearProps: 'transform,opacity' }
            );
        });
    }

    _dismiss() {
        clearTimeout(this._hideTimer);
        const card = this.template.querySelector('.cart-toast');
        if (!card) { this.item = null; return; }
        ensureGsap(this).then((gsap) => {
            if (!gsap) { this.item = null; return; }
            gsap.killTweensOf(card);
            gsap.to(card, {
                x: 90, opacity: 0, duration: 0.28, ease: 'power2.in',
                onComplete: () => { this.item = null; }
            });
        });
    }

    disconnectedCallback() {
        clearTimeout(this._hideTimer);
    }

    get qtyLabel() {
        return this.item && this.item.qty > 1 ? `× ${this.item.qty}` : '';
    }

    handleClose() {
        this._dismiss();
    }

    handleViewCart() {
        clearTimeout(this._hideTimer);
        this.item = null;
        this.dispatchEvent(new CustomEvent('viewcart', { bubbles: true, composed: true }));
    }

    handleImageError(event) {
        event.target.style.display = 'none';
    }
}