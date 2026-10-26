import { error } from '@sveltejs/kit';
import { deflateSync } from 'node:zlib';
import type { RequestHandler } from './$types';
import { requireStation } from '$lib/spigots/spigotAuth.server';
import { renderScreen, screenSpecSchema, SCREEN_HEIGHT, SCREEN_WIDTH } from '$lib/spigots/spigotScreens.server';

/**
 * One station screen, as raw pixels for its display — see `spigotScreens.server.ts`.
 *
 * Stations do not build these URLs; the scan and hello replies hand them over. With
 * `z=1` the pixels come zlib-compressed with a 4 KB window, which a Pico can inflate as
 * it streams: the flat backgrounds shrink a 150 KB screen to a fraction of that, and the
 * Pico's wifi is the slow part.
 */
export const GET: RequestHandler = async (event) => {
    requireStation(event);

    const { searchParams } = event.url;
    // `z` is how to send it and `v` only tells stations apart which version they hold;
    // neither is part of what to draw.
    const spec = screenSpecSchema.safeParse(Object.fromEntries(
        [...searchParams].filter(([key]) => key !== 'z' && key !== 'v'),
    ));
    if (!spec.success) error(400, 'bad screen');

    const pixels = await renderScreen(event.params.ref, spec.data);
    const compressed = searchParams.get('z') === '1';
    const body = compressed ? deflateSync(pixels, { windowBits: 12 }) : pixels;

    return new Response(new Uint8Array(body), {
        headers: {
            'content-type': 'application/octet-stream',
            'content-length': String(body.length),
            'x-screen': `${SCREEN_WIDTH}x${SCREEN_HEIGHT} rgb565${compressed ? ' zlib' : ''}`,
            'cache-control': 'no-store',
        },
    });
};
