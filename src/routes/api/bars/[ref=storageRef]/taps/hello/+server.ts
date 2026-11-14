import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { tapLabel } from '$lib/taps/barTap';
import { requireTap } from '$lib/taps/tapAuth.server';
import { broadcastTaps } from '$lib/taps/tapBoard.server';
import { idleScreen } from '$lib/taps/tapScreens.server';
import { type TapHelloResult } from '$lib/taps/tapEvents';

/**
 * TapTapper heartbeat, sent at boot and every 20 s, replies with the idle screen - the tap's
 * state as it is now, gauge and all. PocketBase notes the tap as seen.
 */
export const POST: RequestHandler = async (event) => {
    const session = await requireTap(event);

    await broadcastTaps(event.locals, session.pb, session.tap.bar.slug);

    return json({
        ok: true,
        // The TapTapper's own font has no diacritics
        label: tapLabel(session.tap).normalize('NFD').replaceAll(/[^\x20-\x7e]/g, ''),
        idle: await idleScreen(session),
    } satisfies TapHelloResult);
};
