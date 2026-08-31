/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;

/** Hashed build output and static files — safe to keep forever, keyed by version. */
const PRECACHE = `baroo-precache-${version}`;
/** HTML documents, captured as they are visited. */
const PAGES = `baroo-pages-${version}`;
/** PocketBase files proxied through /storage. Content-addressed, so never invalidated. */
const STORAGE = 'baroo-storage';

const PRECACHE_URLS = [...build, ...files];

sw.addEventListener('install', (event) => {
    event.waitUntil(
        caches
            .open(PRECACHE)
            .then(cache => cache.addAll(PRECACHE_URLS))
            .then(() => sw.skipWaiting()),
    );
});

sw.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            for (const key of await caches.keys()) {
                if (key === PRECACHE || key === PAGES || key === STORAGE) continue;
                if (!key.startsWith('baroo-')) continue;
                await caches.delete(key);
            }
            await sw.clients.claim();
        })(),
    );
});

sw.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== sw.location.origin) return;

    // The app's own data lives in IndexedDB and knows when it is stale. Caching API
    // responses on top of that would give the kiosk two sources of truth that disagree.
    if (url.pathname.startsWith('/api/')) return;

    if (url.pathname.startsWith('/storage/')) {
        event.respondWith(cacheFirst(request, STORAGE));
        return;
    }

    if (request.mode === 'navigate') {
        event.respondWith(navigationFirst(request));
        return;
    }

    event.respondWith(precachedOrNetwork(request, url));
});

/** Hashed assets can be served straight from the precache. */
async function precachedOrNetwork(request: Request, url: URL): Promise<Response> {
    const cache = await caches.open(PRECACHE);

    if (PRECACHE_URLS.includes(url.pathname)) {
        const hit = await cache.match(url.pathname);
        if (hit) return hit;
    }

    try {
        return await fetch(request);
    } catch (err) {
        const hit = await caches.match(request);
        if (hit) return hit;
        throw err;
    }
}

async function cacheFirst(request: Request, cacheName: string): Promise<Response> {
    const cache = await caches.open(cacheName);
    const hit = await cache.match(request);
    if (hit) return hit;

    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
}

const NAVIGATION_TIMEOUT_MS = 2_000;

/**
 * Network-first with a short leash, cached fallback.
 *
 * A tablet that does have signal always gets fresh code; one that doesn't falls back to
 * whatever it saw last. Because the kiosk routes render client-side, every `/bar/*` URL
 * produces the same shell — so a cached shell for one bar will serve any of them, which
 * is what makes a cold offline start work at all.
 */
async function navigationFirst(request: Request): Promise<Response> {
    const cache = await caches.open(PAGES);

    try {
        const response = await withTimeout(fetch(request), NAVIGATION_TIMEOUT_MS);
        if (response.ok) cache.put(request, response.clone());
        return response;
    } catch {
        const exact = await cache.match(request, { ignoreSearch: true });
        if (exact) return exact;

        const shell = await matchAnyKioskShell(cache);
        if (shell) return shell;

        return new Response(
            '<!doctype html><meta charset="utf-8"><title>Baroo</title>' +
                '<p style="font:1rem system-ui;padding:2rem">Offline, and this page was never cached on this device.</p>',
            { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } },
        );
    }
}

/** Any cached kiosk document will do — they are byte-identical shells. */
async function matchAnyKioskShell(cache: Cache): Promise<Response | undefined> {
    for (const key of await cache.keys()) {
        if (new URL(key.url).pathname.includes('/bar/')) {
            const hit = await cache.match(key);
            if (hit) return hit;
        }
    }
    return undefined;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('navigation-timeout')), ms);
        promise.then(
            value => { clearTimeout(timer); resolve(value); },
            err => { clearTimeout(timer); reject(err); },
        );
    });
}
