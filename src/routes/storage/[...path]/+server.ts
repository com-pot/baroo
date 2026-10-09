import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Same-origin proxy for PocketBase files (offer previews, member avatars).
 *
 * `vite.config.ts` sets this up for `vite dev`; this is the production counterpart —
 * without it the kiosk's images 404 outside dev. The service worker deliberately stays
 * out of this prefix, so offline availability rests on the immutable headers below.
 */
export const GET: RequestHandler = async ({ params, url, fetch, setHeaders }) => {
    if (!env.PB_BASE_URL) {
        error(500, 'PB_BASE_URL is not configured');
    }

    const target = new URL(params.path, env.PB_BASE_URL.replace(/\/$/, '') + '/');
    target.search = url.search;

    const response = await fetch(target, { headers: { accept: '*/*' } });

    if (!response.ok) {
        error(response.status, 'storage-fetch-failed');
    }

    // Only PocketBase's file URLs are content-addressed and safe to cache hard. Everything
    // else under this prefix is live PocketBase (collections, admin UI) and must not be
    // held on to — a stale record read here is indistinguishable from a broken instance.
    const isFile = params.path.startsWith('api/files/');

    setHeaders({
        'cache-control': isFile ? 'public, max-age=31536000, immutable' : 'no-store',
        'content-type': response.headers.get('content-type') || 'application/octet-stream',
    });

    return new Response(response.body, { status: response.status });
};
