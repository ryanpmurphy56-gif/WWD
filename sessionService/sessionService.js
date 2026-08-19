const UID_KEY = 'cart_uid';

const getSessionUID = () => {
    const existing = window.localStorage.getItem(UID_KEY);
    if (existing) return existing;
    const created = 'uid-' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    window.localStorage.setItem(UID_KEY, created);
    return created;
};

const clearSessionUID = () => {
    window.localStorage.removeItem(UID_KEY);
};

export { getSessionUID, clearSessionUID };