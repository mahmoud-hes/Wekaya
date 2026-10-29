// ==========================================================================
// Wekaya (وقاية) v2 - Service Worker
// Strategy: precache the app shell (fonts and icons included), then
// network-first (4 s timeout) with cache fallback for same-origin GETs, so a
// new deploy reaches users on their next online visit and the app still works
// fully offline. Third-party origins are never requested (CSP forbids them).
// ==========================================================================
const VERSION = '2.0.1';
const CACHE_NAME = 'wekaya-cache-v' + VERSION;
const ASSETS = [
    './', './index.html', './style.css', './data.js', './calculations.js', './app.js', './manifest.json',
    './logo.png'
];

self.addEventListener('install', event => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        // Add one by one so a single missing file cannot abort the whole install (cache.addAll is atomic)
        await Promise.all(ASSETS.map(url => cache.add(new Request(url, { cache: 'reload' })).catch(err => console.warn('[Wekaya SW] precache failed:', url, err))));
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter(k => k.startsWith('wekaya-cache-') && k !== CACHE_NAME).map(k => caches.delete(k)));
        await self.clients.claim();
    })());
});

async function networkFirst(request) {
    const cache = await caches.open(CACHE_NAME);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    try {
        const res = await fetch(request, { signal: ctrl.signal });
        clearTimeout(timer);
        if (res && res.status === 200 && res.type === 'basic') cache.put(request, res.clone());
        return res;
    } catch (err) {
        clearTimeout(timer);
        const hit = await cache.match(request, { ignoreSearch: true });
        if (hit) return hit;
        const accept = request.headers.get('accept') || '';
        if (request.mode === 'navigate' || accept.includes('text/html')) {
            const shell = await cache.match('./index.html');
            if (shell) return shell;
        }
        return new Response('Offline', { status: 503, statusText: 'Offline', headers: { 'Content-Type': 'text/plain' } });
    }
}

self.addEventListener('fetch', event => {
    const req = event.request;
    if (req.method !== 'GET') return;
    if (new URL(req.url).origin !== self.location.origin) return; // never touch third-party requests
    event.respondWith(networkFirst(req));
});
