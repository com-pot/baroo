import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireTapKiosk } from '$lib/taps/tapAuth.server';
import { findOffer } from '$lib/taps/tapHub.server';
import { serveOffer } from '$lib/taps/tapOffers.server';
import { kioskServeSchema } from '$lib/taps/tapEvents';

/**
 * Serving of a pending offer picked on a kiosk - the offer's tap files the order, as if
 * picked on its buttons
 */
export const POST: RequestHandler = async (event) => {
    await requireTapKiosk(event);

    const body = kioskServeSchema.safeParse(await event.request.json().catch(() => null));
    if (!body.success) error(400, 'expected { variant }');

    const barSlug = event.params.ref;
    const offer = findOffer(barSlug, event.params.id);
    if (!offer) error(404, 'offer-gone');
    if (offer.state === 'served') return json({ ok: true, variant: offer.variant });
    if (offer.state === 'dismissed') error(409, 'offer-dismissed');

    const served = await serveOffer(event.locals, barSlug, offer.id, body.data.variant, 'kiosk');
    if (!served) error(409, 'offer-settled');

    return json({ ok: true, variant: body.data.variant });
};
