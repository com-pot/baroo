import z from 'zod';
import { error, json } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import type { RequestHandler } from './$types';
import { formatQuantity } from '$lib/bar/quantity';
import { normalizeTag } from '$lib/bar/tags';
import { barDoUnseal } from '$lib/bar/ops/unseal';
import { requireTap, type TapSession } from '$lib/taps/tapAuth.server';
import { broadcastTaps, tapState } from '$lib/taps/tapBoard.server';
import { lookupCard, lookupPackageTag, type Package } from '$lib/taps/tapLookup.server';
import { openOffer } from '$lib/taps/tapOffers.server';
import { OFFER_WAIT_MS, tapButtons, tapScreens } from '$lib/taps/tapScreens.server';
import { cardUid, TAP_UNSEAL_PREFIX, type TapScanResult } from '$lib/taps/tapEvents';
import { getBarOfferItem } from '$lib/bar/stats/barOfferItems';

const tapScanSchema = z.object({
    uid: cardUid,
});

/**
 * Card tapped at a TapTapper
 *
 * A package tag unseals its package onto the tap. A member's card opens an
 * offer of what the tap pours, waiting for a serving from the TapTapper's buttons (`../serve`).
 */
export const POST: RequestHandler = async (event) => {
    const session = await requireTap(event);

    const { locals } = event;
    const barSlug = session.tap.bar.slug;
    const body = tapScanSchema.safeParse(await event.request.json().catch(() => null));
    if (!body.success) error(400, 'expected { uid }');

    const serialId = normalizeTag(body.data.uid);
    const at = new Date().toISOString();
    const tap = session.ref;

    const offerPackage = await lookupPackageTag(session.pb, barSlug, serialId);
    if (offerPackage) {
        return reply(await unsealPackage(locals, session, offerPackage, at));
    }

    const state = await tapState(session.pb, barSlug, tap);
    if (!state.offerItemKey) {
        return reply({ result: 'no-offer', ...await tapScreens(session, { view: 'unset' }) });
    }

    const holder = await lookupCard(session.pb, barSlug, serialId);
    if (!holder) {
        return reply({ result: 'unknown-card', ...await tapScreens(session, { view: 'unknown-card', serial: serialId }) });
    }

    const offerItemKey = state.offerItemKey;
    const drink = await getBarOfferItem(session.pb, barSlug, offerItemKey);
    // The buttons answer the servings in order, the ones past the last button are not on offer here
    const variants = (drink?.servings ?? [])
        .slice(0, tapButtons(session.tap).length)

    if (!variants.length) {
        return reply({
            result: 'no-sizes',
            ...await tapScreens(session, { view: 'offer', item: offerItemKey, serial: serialId, warn: 'no-sizes' }),
        });
    }

    const offer = openOffer(barSlug, {
        id: randomUUID(),
        barId: session.tap.bar.id,
        tap,
        serialId,
        memberId: holder.id,
        offerItemKey,
        at,
        pb: session.pb,
    });

    return reply({
        result: 'offer',
        offer: offer.id,
        variants,
        ...await tapScreens(session, {
            view: 'offer',
            item: offerItemKey,
            serial: serialId,
            variants: variants.map((variant) => variant.key).join(','),
        }, OFFER_WAIT_MS),
    });
};

async function unsealPackage(
    locals: App.Locals,
    session: TapSession,
    offerPackage: Package,
    at: string,
): Promise<TapScanResult> {
    const barSlug = session.tap.bar.slug;
    const tap = session.ref;
    const { offerItemKey, quantity } = offerPackage;
    const drink = await getBarOfferItem(session.pb, barSlug, offerItemKey);
    const name = drink?.name ?? offerItemKey;
    const label = offerPackage.label || formatQuantity(drink?.measure ?? 'volume', quantity, locals.i18n.locale);

    // Tapped again, the package is on the tap already
    const before = await tapState(session.pb, barSlug, tap);
    const again = before.stock?.packageId === offerPackage.id;

    if (!again) {
        await barDoUnseal({ pb: session.pb }, barSlug, {
            offerItemKey,
            packageId: offerPackage.id,
            quantity,
            tap,
            clientId: `${TAP_UNSEAL_PREFIX}${randomUUID()}`,
            occurredAt: at,
        });

        await broadcastTaps(locals, session.pb, barSlug);
    }

    const after = await tapState(session.pb, barSlug, tap);

    return {
        result: 'package',
        package: { offerItemKey, name, label, quantity },
        ...await tapScreens(session, {
            view: 'unsealed',
            item: offerItemKey,
            label,
            left: after.stock?.left,
            total: after.stock?.quantity,
        }),
    };
}

const reply = (result: TapScanResult) => json(result);
