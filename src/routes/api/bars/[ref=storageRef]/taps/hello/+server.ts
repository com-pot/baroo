import z from 'zod';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { tapLabel } from '$lib/taps/barTap';
import { requireTap } from '$lib/taps/tapAuth.server';
import { broadcastTaps } from '$lib/taps/tapBoard.server';
import { findOffer, listenerCount } from '$lib/taps/tapHub.server';
import { goneScreens, idleScreen, SCREEN_HOLD_MS, servedScreens } from '$lib/taps/tapScreens.server';
import { type TapHelloResult } from '$lib/taps/tapEvents';

const tapHelloSchema = z.object({
    /** The offer the TapTapper waits on, its state comes back once it is not pending */
    offer: z.uuid().optional(),
});

/**
 * TapTapper heartbeat, sent at boot and every 20 s, replies with the idle screen - the tap's
 * state as it is now, gauge and all. PocketBase notes the tap as seen.
 *
 * While a TapTapper waits on an offer it asks every couple of seconds, and hears once the
 * offer got served on a kiosk or dismissed there.
 */
export const POST: RequestHandler = async (event) => {
    const session = await requireTap(event);

    const body = tapHelloSchema.safeParse(await event.request.json().catch(() => null));
    if (!body.success) error(400, 'expected { offer? }');

    const { locals } = event;
    const barSlug = session.tap.bar.slug;
    const { offer: offerId } = body.data;

    let offer: TapHelloResult["offer"];
    if (offerId) {
        const pending = findOffer(barSlug, offerId);
        if (pending?.state === 'served' && pending.variant) {
            offer = { state: 'served', ...await servedScreens(session, { ...pending, variant: pending.variant }), hold: SCREEN_HOLD_MS };
        } else if (pending?.state !== 'pending') {
            offer = { state: 'gone', ...await goneScreens(session) };
        }
    } else {
        await broadcastTaps(locals, session.pb, barSlug);
    }

    return json({
        ok: true,
        // The TapTapper's own font has no diacritics
        label: tapLabel(session.tap).normalize('NFD').replaceAll(/[^\x20-\x7e]/g, ''),
        listeners: listenerCount(barSlug),
        idle: await idleScreen(session),
        ...(offer ? { offer } : {}),
    } satisfies TapHelloResult);
};
