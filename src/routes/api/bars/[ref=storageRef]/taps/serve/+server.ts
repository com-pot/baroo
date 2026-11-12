import z from 'zod';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireTap } from '$lib/taps/tapAuth.server';
import { lookupDrink } from '$lib/taps/tapLookup.server';
import { findOffer, serveOffer } from '$lib/taps/tapOffers.server';
import { goneScreens, servedScreens } from '$lib/taps/tapScreens.server';
import { servingKey, type TapServeResult } from '$lib/taps/tapEvents';

const tapServeSchema = z.object({
    /** `offer` from the scan reply */
    offer: z.uuid(),
    /** Serving key */
    variant: servingKey,
});

/**
 * Serving picked on a TapTapper's buttons for the offer of its last scan
 *
 * The tap files the order, the reply shows what is left on the tap after it.
 */
export const POST: RequestHandler = async (event) => {
    const session = await requireTap(event);

    const { locals } = event;
    const barSlug = session.tap.bar.slug;
    const body = tapServeSchema.safeParse(await event.request.json().catch(() => null));
    if (!body.success) error(400, 'expected { offer, variant }');

    const { variant } = body.data;

    const offer = findOffer(barSlug, body.data.offer);
    if (!offer || offer.tap !== session.ref) {
        return reply({ result: 'gone', ...await goneScreens(session) });
    }

    if (offer.state === 'served') {
        // The reply to the first press got lost
        return reply({ result: 'served', ...await servedScreens(session, { ...offer, variant: offer.variant ?? variant }) });
    }

    const drink = await lookupDrink(session.pb, barSlug, offer.offerItemKey);
    if (drink && !drink.servings.some((serving) => serving.key === variant)) error(400, 'size-not-offered');

    const served = await serveOffer(locals, barSlug, offer.id, variant);
    if (!served) {
        return reply({ result: 'gone', ...await goneScreens(session) });
    }

    return reply({ result: 'served', ...await servedScreens(session, { ...served, variant }) });
};

const reply = (result: TapServeResult) => json(result);
