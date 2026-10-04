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
                if (key === PRECACHE || key === PAGES) continue;
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
    if (url.pathname.startsWith('/api/')) return;

    // Avoid caching subdirectory-routed pocketbase under `/storage/`
    if (url.pathname.startsWith('/storage/')) return;

    if (request.mode === 'navigate') {
        event.respondWith(navigationFirst(request));
        return;
    }

    event.respondWith(precachedOrNetwork(request, url));
});

/** Hashed assets can be served straight from the precache. */
async function precachedOrNetwork(request: Request, url: URL): Promise<Response> {
    const cache = await caches.open(PRECACHE);

    const hit = PRECACHE_URLS.includes(url.pathname) && await cache.match(url.pathname);
    if (hit) return hit;

    try {
        return await fetch(request);
    } catch (err) {
        const hit = await caches.match(request);
        if (hit) return hit;
        throw err;
    }
}

const NAVIGATION_TIMEOUT_MS = 2_000;

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
