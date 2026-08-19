/**
 * cartService — F13b. Client-side cart for a site's Shop products, keyed by
 * siteId in localStorage. No Apex/credentials: each cart line still checks
 * out through that product's own Buy_Link__c (a Square Checkout Link, Stripe
 * Payment Link, PayPal.me, etc.) — this only lets a visitor collect several
 * products before paying for each individually. See sectionShop/siteCart.
 */
const STORAGE_PREFIX = 'ws_cart_';
export const CART_CHANGE_EVENT = 'websuitecartchange';

function storageKey(siteId) {
    return `${STORAGE_PREFIX}${siteId}`;
}

function read(siteId) {
    if (!siteId) {
        return [];
    }
    try {
        const raw = window.localStorage.getItem(storageKey(siteId));
        const items = raw ? JSON.parse(raw) : [];
        return Array.isArray(items) ? items : [];
    } catch {
        return [];
    }
}

function write(siteId, items) {
    if (!siteId) {
        return;
    }
    try {
        window.localStorage.setItem(storageKey(siteId), JSON.stringify(items));
    } catch {
        // storage unavailable (private browsing, quota) — cart just won't persist
    }
    window.dispatchEvent(new CustomEvent(CART_CHANGE_EVENT, { detail: { siteId } }));
}

export function getCart(siteId) {
    return read(siteId);
}

export function getCartCount(siteId) {
    return read(siteId).reduce((n, i) => n + i.qty, 0);
}

export function addItem(siteId, product, qty = 1) {
    const items = read(siteId);
    const existing = items.find((i) => i.productId === product.id);
    if (existing) {
        existing.qty += qty;
    } else {
        items.push({
            productId: product.id,
            name: product.name,
            price: Number(product.price) || 0,
            imageUrl: product.imageUrl || '',
            buyLink: product.buyLink || '',
            qty
        });
    }
    write(siteId, items);
}

export function updateQty(siteId, productId, qty) {
    let items = read(siteId);
    if (qty <= 0) {
        items = items.filter((i) => i.productId !== productId);
    } else {
        items = items.map((i) => (i.productId === productId ? { ...i, qty } : i));
    }
    write(siteId, items);
}

export function removeItem(siteId, productId) {
    write(siteId, read(siteId).filter((i) => i.productId !== productId));
}

export function clearCart(siteId) {
    write(siteId, []);
}
