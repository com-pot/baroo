import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Same-origin proxy for PocketBase files (offer previews, member avatars).
 *
 * `vite.config.ts` sets this up for `vite dev`; this is the production counterpart —
 * without it the kiosk's images 404 outside dev. Being same-origin is also what lets
 * the service worker cache them for offline use.
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

    // PocketBase file URLs are content-addressed, so they can be cached hard.
    setHeaders({
        'cache-control': 'public, max-age=31536000, immutable',
        'content-type': response.headers.get('content-type') || 'application/octet-stream',
    });

    return new Response(response.body, { status: response.status });
};
