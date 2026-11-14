import { error } from '@sveltejs/kit';
import { ClientResponseError } from 'pocketbase';
import type { Db } from '$lib/db.server';
import { broadcastTaps } from './tapBoard.server';
import { TAP_ORDER_PREFIX } from './tapEvents';
import { resolveOrderSource } from '$lib/bar/ops/orderPackage.server';

/** Member card tapped at a TapTapper, until a serving on its buttons settles it */
export type PendingOffer = {
    id: string;
    barId: string;
    tap: string;
    serialId: string;
    memberId: string;
    offerItemKey: string;
    at: string;
    state: 'pending' | 'served';
    /** The serving it got */
    variant?: string;
    /** The tap's own session, it files the order */
    pb: Db;
};

/** Long past any TapTapper's wait on its buttons */
const OFFER_FORGET_MS = 5 * 60_000;

const OFFERS_KEY = Symbol.for('baroo.tapOffers');

/** Offers per bar slug, keyed by id - on `globalThis` to survive vite hot reloads */
const offersByBar: Map<string, Map<string, PendingOffer>> = ((globalThis as unknown as Record<symbol, Map<string, Map<string, PendingOffer>> | undefined>)[OFFERS_KEY] ??= new Map());

export function openOffer(barSlug: string, offer: Omit<PendingOffer, 'state'>): PendingOffer {
    const pending: PendingOffer = { ...offer, state: 'pending' };
    offers(barSlug).set(offer.id, pending);
    return pending;
}

export function findOffer(barSlug: string, id: string): PendingOffer | undefined {
    return offers(barSlug).get(id);
}

/**
 * Files the order of a pending offer as its tap
 *
 * `null` when the offer is not pending any more.
 */
export async function serveOffer(
    ctx: Pick<App.Locals, "logger">,
    barSlug: string,
    offerId: string,
    variant: string,
): Promise<PendingOffer | null> {
    // Settled first, so a second press can't pour twice
    const offer = offers(barSlug).get(offerId);
    if (!offer || offer.state !== 'pending') return null;
    offer.state = 'served';
    offer.variant = variant;

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

    await broadcastTaps(ctx, offer.pb, barSlug).catch((err) => ctx.logger.error(err, '[taps] could not tell what is on the taps'));

    return offer;
}

function offers(barSlug: string): Map<string, PendingOffer> {
    const known = offersByBar.get(barSlug) ?? new Map<string, PendingOffer>();
    offersByBar.set(barSlug, known);

    const forgetBefore = Date.now() - OFFER_FORGET_MS;
    for (const [id, offer] of known) {
        if (Date.parse(offer.at) < forgetBefore) known.delete(id);
    }

    return known;
}
