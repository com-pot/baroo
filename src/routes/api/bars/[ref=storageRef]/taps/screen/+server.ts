import { error } from '@sveltejs/kit';
import { deflateSync } from 'node:zlib';
import type { RequestHandler } from './$types';
import { requireTap } from '$lib/taps/tapAuth.server';
import { renderScreen, screenSpecSchema, SCREEN_HEIGHT, SCREEN_WIDTH } from '$lib/taps/tapScreens.server';

/**
 * TapTapper screen pixels, URLs come from the scan, serve and hello replies
 *
 * `z=1` compresses with a 4 KB zlib window, small enough for a Pico to inflate while streaming
 */
export const GET: RequestHandler = async (event) => {
    const session = await requireTap(event);

    const { searchParams } = event.url;
    const spec = screenSpecSchema.safeParse(Object.fromEntries(
        [...searchParams].filter(([key]) => key !== 'z' && key !== 'v'),
    ));
    if (!spec.success) error(400, 'bad screen');

    const pixels = await renderScreen(event.locals, session, spec.data);
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
