import { error } from '@sveltejs/kit';
import { ClientResponseError } from 'pocketbase';
import { broadcastTaps } from './tapBoard.server';
import { emit, settleOffer, type PendingOffer } from './tapHub.server';
import { TAP_ORDER_PREFIX } from './tapEvents';
import { resolveOrderSource } from '$lib/bar/ops/orderPackage.server';

/**
 * Files the order of a pending offer as its tap - whether the serving was picked on the
 * TapTapper's buttons or on a kiosk - and tells the kiosks
 *
 * `null` when the offer is not pending any more.
 */
export async function serveOffer(
    ctx: Pick<App.Locals, "logger">,
    barSlug: string,
    offerId: string,
    variant: string,
    source: 'tapper' | 'kiosk',
): Promise<PendingOffer | null> {
    // Settled first, so a second press or a kiosk at the same time can't pour twice
    const offer = settleOffer(barSlug, offerId, 'served', variant);
    if (!offer) return null;

    const at = new Date().toISOString();
    try {
        await offer.pb.collection('bar_order_items').create({
            customer: offer.memberId,
            key: offer.offerItemKey,
            variant,
            orderedAt: at,
            clientId: `${TAP_ORDER_PREFIX}${offer.id}#0`,
            ...await resolveOrderSource(offer.pb, { id: offer.barId }, { key: offer.offerItemKey, tap: offer.tap, at }),
        });
    } catch (err) {
        offer.state = 'pending';
        offer.variant = undefined;
        ctx.logger.error(err, '[taps] could not file the order of an offer');

        if (err instanceof ClientResponseError && err.status === 0) error(503, 'pb-unreachable');
        error(502, 'order-not-filed');
    }

    emit(ctx, barSlug, {
        type: 'offer-served',
        id: offer.id,
        tap: offer.tap,
        serialId: offer.serialId,
        offerItemKey: offer.offerItemKey,
        variant,
        at,
        source,
    });

    await broadcastTaps(ctx, offer.pb, barSlug).catch((err) => ctx.logger.error(err, '[taps] could not tell what is on the taps'));

    return offer;
}

/** The other kiosks drop the offer too, the TapTapper waiting on it hears with its next poll */
export function dismissOffer(ctx: Pick<App.Locals, "logger">, barSlug: string, offerId: string): void {
    const offer = settleOffer(barSlug, offerId, 'dismissed');
    if (!offer) return;

    emit(ctx, barSlug, { type: 'offer-dismissed', id: offer.id, tap: offer.tap, at: new Date().toISOString() });
}
