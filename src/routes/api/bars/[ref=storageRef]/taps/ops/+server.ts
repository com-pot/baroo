import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { StockEvent } from '$lib/bar/stats/barOfferItems';
import { requireTapKiosk } from '$lib/taps/tapAuth.server';
import { broadcastTaps, journal, type BoardOrder } from '$lib/taps/tapBoard.server';
import { emit, settleOffer } from '$lib/taps/tapHub.server';
import { TAP_ORDER_PREFIX, tapOpsSchema } from '$lib/taps/tapEvents';

/**
 * Ops a kiosk just filed, so the taps show them before any sync reaches PocketBase
 *
 * An order for a pending offer serves the offer, too. Must work without PocketBase.
 */
export const POST: RequestHandler = async (event) => {
    const kiosk = requireTapKiosk(event);

    const body = tapOpsSchema.safeParse(await event.request.json().catch(() => null));
    if (!body.success) {
        error(400, {
            message: "invalid-data",
            details: { issues: body.error.issues },
        });
    }

    const { locals } = event;
    const barSlug = event.params.ref;
    const events: (StockEvent & { clientId: string })[] = [];
    const orders: (BoardOrder & { clientId: string })[] = [];

    for (const op of body.data.ops) {
        if (op.kind === 'order') {
            op.items.forEach((item, index) => orders.push({
                // As the sync names the order's rows
                clientId: `${op.clientId}#${index}`,
                offerItemKey: item.key,
                variant: item.variant,
                orderedAt: op.occurredAt,
            }));

            if (op.clientId.startsWith(TAP_ORDER_PREFIX)) {
                serveOffer(locals, barSlug, op.clientId.slice(TAP_ORDER_PREFIX.length), op.items[0].variant);
            }
            continue;
        }

        // The sync takes these from staff kiosks only
        if (kiosk.kind !== 'staff') continue;

        events.push(op.kind === 'unseal'
            ? {
                type: 'unseal',
                clientId: op.clientId,
                offerItemKey: op.offerItemKey,
                occurredAt: op.occurredAt,
                quantity: op.quantity,
                tap: op.tap ?? null,
                packageId: op.packageId ?? null,
                flushCurrent: op.flushCurrent,
            }
            : {
                type: 'flush',
                clientId: op.clientId,
                offerItemKey: op.offerItemKey,
                occurredAt: op.occurredAt,
                tap: op.tap ?? null,
            });
    }

    if (await journal(locals, barSlug, { events, orders })) {
        await broadcastTaps(locals, barSlug);
    }

    return json({ ok: true });
};

/** The other kiosks drop the offer, the TapTapper waiting on it hears with its next poll */
function serveOffer(locals: App.Locals, barSlug: string, offerId: string, variant: string): void {
    const offer = settleOffer(barSlug, offerId, 'served', variant);
    if (!offer) return;

    emit(locals, barSlug, {
        type: 'offer-served',
        id: offer.id,
        tap: offer.tap,
        serialId: offer.serialId,
        offerItemKey: offer.offerItemKey,
        variant,
        at: new Date().toISOString(),
        source: 'kiosk',
    });
}
