import recordEvent from '@salesforce/apex/FunnelTracker.recordEvent';

const SESSION_KEY = 'pnp_funnel_session';

/**
 * Get or create a session ID for the current browser session.
 * Persists in sessionStorage — survives page reloads, dies with tab close.
 */
export function getSessionId() {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
        // Simple UUID v4 generator — good enough for session tracking
        id = 'sess-' + Date.now() + '-' + Math.random().toString(36).substring(2, 11);
        sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
}

/**
 * Fire a funnel event. Fire-and-forget — never awaits, never throws.
 * Safe to call from anywhere. Failures are logged to console only.
 */
export function trackEvent(eventType, productId, opts = {}) {
    if (!eventType || !productId) return;

    const payload = {
        eventType: eventType,
        productId: productId,
        sessionId: getSessionId(),
        cartId: opts.cartId || null,
        quantity: opts.quantity || 1,
        unitPrice: opts.unitPrice || null
    };

    recordEvent(payload).catch(err => {
        // Tracking is best-effort. Log but don't surface to the user.
        console.debug('FunnelTracker:', err && err.body ? err.body.message : err);
    });
}