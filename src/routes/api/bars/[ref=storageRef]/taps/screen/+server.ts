import { error } from '@sveltejs/kit';
import { deflateSync } from 'node:zlib';
import type { RequestHandler } from './$types';
import { requireTap } from '$lib/taps/tapAuth.server';
import {
    idleScreen,
    idleScreenUpdatedAt,
    renderScreen,
    screenSpecSchema,
    SCREEN_HEIGHT,
    SCREEN_WIDTH,
} from '$lib/taps/tapScreens.server';

/**
 * TapTapper screen pixels
 *
 * Without `view` it is the idle screen - the tap as it is now - at the TapTapper's own
 * `IDLE_SCREEN`. Its `ETag` is when it last changed: a TapTapper asking `If-None-Match` with
 * the one on its panel gets `304 Not Modified` until something happens on the tap. The other
 * screens' URLs come from the scan and serve replies, all they show is in them.
 *
 * `z=1` compresses with a 4 KB zlib window, small enough for a Pico to inflate while streaming
 */
export const GET: RequestHandler = async (event) => {
    const session = await requireTap(event);

    const { searchParams } = event.url;
    const compressed = searchParams.get('z') === '1';

    if (!searchParams.has('view')) {
        // Taken before the state it is drawn from: whatever lands in between is drawn once more
        const etag = `"${(await idleScreenUpdatedAt(session)) ?? 'never'}"`;
        if (matches(event.request.headers.get('if-none-match'), etag)) {
            event.locals.logger.info({ msg: 'screen-etag-valid', tap: session.ref, etag });
            return new Response(null, { status: 304, headers: { etag, 'cache-control': 'no-cache' } });
        }

        event.locals.logger.info({ msg: 'rendering-screen', tap: session.ref, view: 'idle', etag });
        const pixels = await renderScreen(event.locals, session, await idleScreen(session));
        return screenResponse(pixels, compressed, { etag, 'cache-control': 'no-cache' });
    }

    const spec = screenSpecSchema.safeParse(Object.fromEntries(
        [...searchParams].filter(([key]) => key !== 'z'),
    ));
    if (!spec.success) error(400, 'bad screen');

    event.locals.logger.info({ msg: 'rendering-screen', tap: session.ref, view: spec.data.view });

    return screenResponse(await renderScreen(event.locals, session, spec.data), compressed, { 'cache-control': 'no-store' });
};

function screenResponse(pixels: Buffer, compressed: boolean, headers: Record<string, string>): Response {
    const body = compressed ? deflateSync(pixels, { windowBits: 12 }) : pixels;

    return new Response(new Uint8Array(body), {
        headers: {
            ...headers,
            'content-type': 'application/octet-stream',
            'content-length': String(body.length),
            'x-screen': `${SCREEN_WIDTH}x${SCREEN_HEIGHT} rgb565${compressed ? ' zlib' : ''}`,
        },
    });
}

function matches(ifNoneMatch: string | null, etag: string): boolean {
    return !!ifNoneMatch && ifNoneMatch.split(',').some((candidate) => candidate.trim().replace(/^W\//, '') === etag);
}
