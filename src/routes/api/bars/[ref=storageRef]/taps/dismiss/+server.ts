import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireTapKiosk } from '$lib/taps/tapAuth.server';
import { emit, settleOffer } from '$lib/taps/tapHub.server';
import { tapDismissSchema } from '$lib/taps/tapEvents';

/**
 * Pending offer dropped on a kiosk - the other kiosks drop it too, the TapTapper stops waiting
 */
export const POST: RequestHandler = async (event) => {
    requireTapKiosk(event);

    const body = tapDismissSchema.safeParse(await event.request.json().catch(() => null));
    if (!body.success) error(400, 'expected { offer }');

    const barSlug = event.params.ref;
    const offer = settleOffer(barSlug, body.data.offer, 'dismissed');
    if (offer) {
        emit(event.locals, barSlug, { type: 'offer-dismissed', id: offer.id, tap: offer.tap, at: new Date().toISOString() });
    }

    return json({ ok: true });
};
