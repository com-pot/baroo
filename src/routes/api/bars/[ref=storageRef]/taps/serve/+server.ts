import z from 'zod';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireTap } from '$lib/taps/tapAuth.server';
import { getBarOfferItem } from '$lib/bar/stats/barOfferItems';
import { findOffer, serveOffer } from '$lib/taps/tapOffers.server';
import { servedScreen } from '$lib/taps/tapScreens.server';
import { servingKey, type TapScreens } from '$lib/taps/tapEvents';

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
        return reply({ result: 'gone', screen: null });
    }

    if (offer.state === 'served') {
        return reply({ result:
            'served',
            screen: servedScreen(session, { ...offer, variant: offer.variant ?? variant }),
        });
    }

    const drink = await getBarOfferItem(session.pb, barSlug, offer.offerItemKey);
    if (drink && !drink.servings.some((serving) => serving.key === variant)) error(400, 'size-not-offered');

    const served = await serveOffer({...locals, pb: session.pb}, barSlug, offer.id, variant);
    if (!served) {
        return reply({ result: 'gone', screen: null });
    }

    return reply({ result: 'served', screen: servedScreen(session, { ...served, variant }) });
};

const reply = (result: TapServeResult) => json(result);
export type TapServeResult = TapScreens & { result: 'served' | 'gone' };
