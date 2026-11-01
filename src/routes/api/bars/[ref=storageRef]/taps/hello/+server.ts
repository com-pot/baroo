import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireTapper } from '$lib/taps/tapAuth.server';
import { broadcastTaps } from '$lib/taps/tapBoard.server';
import { findOffer, listenerCount, touchTapper } from '$lib/taps/tapHub.server';
import { goneScreens, idleScreen, SCREEN_HOLD_MS, servedScreens } from '$lib/taps/tapScreens.server';
import { tapHelloSchema, type TapHelloResult } from '$lib/taps/tapEvents';

/**
 * TapTapper heartbeat, sent at boot and every 30 s, replies with the idle screen - the tap's
 * state as it is now, gauge and all
 *
 * While a TapTapper waits on an offer it asks every couple of seconds, and hears once the
 * offer got served on a kiosk or dismissed there.
 */
export const POST: RequestHandler = async (event) => {
    requireTapper(event);

    const body = tapHelloSchema.safeParse(await event.request.json().catch(() => null));
    if (!body.success) error(400, 'expected { tap, buttons?, offer? }');

    const { locals } = event;
    const barSlug = event.params.ref;
    const { tap, buttons, offer: offerId } = body.data;
    touchTapper(barSlug, tap, buttons);

    let offer: TapHelloResult["offer"];
    if (offerId) {
        const pending = findOffer(barSlug, offerId);
        if (pending?.state === 'served' && pending.variant) {
            offer = { state: 'served', ...await servedScreens(locals, barSlug, { ...pending, variant: pending.variant }), hold: SCREEN_HOLD_MS };
        } else if (pending?.state !== 'pending') {
            offer = { state: 'gone', ...await goneScreens(locals, barSlug, tap) };
        }
    } else {
        // Kiosks judge liveness by the heartbeats, the polls for an offer are not ones
        await broadcastTaps(locals, barSlug);
    }

    return json({
        ok: true,
        listeners: listenerCount(barSlug),
        idle: await idleScreen(locals, barSlug, tap),
        ...(offer ? { offer } : {}),
    } satisfies TapHelloResult);
};
