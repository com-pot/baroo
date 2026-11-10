import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireTapKiosk } from '$lib/taps/tapAuth.server';
import { dismissOffer } from '$lib/taps/tapOffers.server';
import { tapDismissSchema } from '$lib/taps/tapEvents';

/**
 * Pending offer dropped on a kiosk - the other kiosks drop it too, the TapTapper stops waiting
 */
export const POST: RequestHandler = async (event) => {
    await requireTapKiosk(event);

    const body = tapDismissSchema.safeParse(await event.request.json().catch(() => null));
    if (!body.success) error(400, 'expected { offer }');

    dismissOffer(event.locals, event.params.ref, body.data.offer);

    return json({ ok: true });
};
