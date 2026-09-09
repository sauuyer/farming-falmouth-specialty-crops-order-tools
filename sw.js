/*
 * Pass-through service worker — caches nothing on purpose.
 *
 * Registered only to satisfy Chrome's PWA install criterion for home.html.
 * Do NOT add caching here. Stale crop data would show chefs items that are
 * already sold out. Queued offline orders would also bypass the LockService
 * availability check inside placeOrder_() in Code.gs — a chef could "reserve"
 * a crop on their phone and discover later it was already claimed.
 */
self.addEventListener('fetch', e => e.respondWith(fetch(e.request)));
