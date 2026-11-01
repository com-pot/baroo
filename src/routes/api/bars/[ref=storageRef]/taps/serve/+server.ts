import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireTapper } from '$lib/taps/tapAuth.server';
import { broadcastTaps, journal } from '$lib/taps/tapBoard.server';
import { lookupDrink } from '$lib/taps/tapDirectory.server';
import { emit, findOffer, listenerCount, settleOffer, touchTapper } from '$lib/taps/tapHub.server';
import { goneScreens, servedScreens } from '$lib/taps/tapScreens.server';
import { TAP_ORDER_PREFIX, tapServeSchema, type TapServeResult } from '$lib/taps/tapEvents';

/**
 * Serving picked on a TapTapper's buttons for the offer of its last scan
 *
 * The kiosks file the order, the reply shows what is left on the tap after it. Must work
 * without PocketBase.
 */
export const POST: RequestHandler = async (event) => {
    requireTapper(event);

    const { locals } = event;
    const barSlug = event.params.ref;
    const body = tapServeSchema.safeParse(await event.request.json().catch(() => null));
    if (!body.success) error(400, 'expected { tap, offer, size }');

    const { tap, size } = body.data;
    touchTapper(barSlug, tap, undefined);

    const offer = findOffer(barSlug, body.data.offer);
    if (!offer || offer.tap !== tap || offer.state === 'dismissed') {
        return reply({ result: 'gone', delivered: 0, ...await goneScreens(locals, barSlug, tap) });
    }

    if (offer.state === 'served') {
        // Served on a kiosk meanwhile, or the reply to the first press got lost
        return reply({
            result: 'served',
            delivered: listenerCount(barSlug),
            ...await servedScreens(locals, barSlug, { ...offer, variant: offer.variant ?? size }),
        });
    }

    const drink = await lookupDrink(locals, barSlug, offer.offerItemKey);
    if (drink && !drink.servings.includes(size)) error(400, 'size-not-offered');

    const at = new Date().toISOString();
    const delivered = emit(locals, barSlug, {
        type: 'offer-served',
        id: offer.id,
        tap,
        serialId: offer.serialId,
        offerItemKey: offer.offerItemKey,
        variant: size,
        at,
        source: 'tapper',
    });

    if (delivered) {
        settleOffer(barSlug, offer.id, 'served', size);
        await journal(locals, barSlug, {
            orders: [{ clientId: `${TAP_ORDER_PREFIX}${offer.id}#0`, offerItemKey: offer.offerItemKey, variant: size, orderedAt: at }],
        });
        await broadcastTaps(locals, barSlug);
    }

    return reply({
        result: 'served',
        delivered,
        ...await servedScreens(locals, barSlug, { ...offer, variant: size }, delivered ? undefined : 'no-kiosk'),
    });
};

const reply = (result: TapServeResult) => json(result);
