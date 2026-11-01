import { error, json } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import type { RequestHandler } from './$types';
import { formatQuantity } from '$lib/bar/quantity';
import { normalizeTag } from '$lib/bar/tags';
import { requireTapper } from '$lib/taps/tapAuth.server';
import { broadcastTaps, journal, tapState } from '$lib/taps/tapBoard.server';
import { lookupDrink, lookupPackageTag, type Package } from '$lib/taps/tapDirectory.server';
import { emit, listenerCount, openOffer, touchTapper } from '$lib/taps/tapHub.server';
import { OFFER_WAIT_MS, SCREEN_HOLD_MS, tapScreens } from '$lib/taps/tapScreens.server';
import { TAP_UNSEAL_PREFIX, tapScanSchema, type TapScanResult } from '$lib/taps/tapEvents';

/**
 * Card tapped at a TapTapper
 *
 * A package tag unseals a fresh package of its kind onto the tap, filed by the staff kiosks.
 * Any other card goes to the kiosks as an offer of what the tap pours, waiting for a serving
 * from a kiosk or the TapTapper's buttons (`../serve`). Members are resolved by the kiosk,
 * the display shows only cards known from the last snapshot pull. Must work without PocketBase.
 */
export const POST: RequestHandler = async (event) => {
    requireTapper(event);

    const { locals } = event;
    const barSlug = event.params.ref;
    const body = tapScanSchema.safeParse(await event.request.json().catch(() => null));
    if (!body.success) error(400, 'expected { tap, uid, buttons? }');

    const { tap, buttons } = body.data;
    const serialId = normalizeTag(body.data.uid);
    const at = new Date().toISOString();
    touchTapper(barSlug, tap, buttons);

    const offerPackage = await lookupPackageTag(locals, barSlug, serialId);
    if (offerPackage) {
        return reply(await unsealPackage(locals, barSlug, tap, offerPackage, at));
    }

    const state = await tapState(locals, barSlug, tap);
    if (!state.offerItemKey) {
        emit(locals, barSlug, { type: 'tap-unset', tap, serialId, at });
        return reply({ result: 'no-offer', ...await tapScreens(locals, barSlug, tap, { view: 'unset', tap }) });
    }

    const offerItemKey = state.offerItemKey;
    const offer = openOffer(barSlug, { id: randomUUID(), tap, serialId, offerItemKey, at });
    const delivered = emit(locals, barSlug, { type: 'pending-offer', id: offer.id, tap, serialId, offerItemKey, at });

    // Only the sizes the item is offered in, and no buttons with no kiosk to file the serving
    const drink = await lookupDrink(locals, barSlug, offerItemKey);
    const sizes = delivered ? (buttons ?? []).filter((size) => drink?.servings.includes(size)) : [];

    return reply({
        result: 'offer',
        offer: offer.id,
        sizes,
        delivered,
        ...await tapScreens(locals, barSlug, tap, {
            view: 'offer',
            tap,
            item: offerItemKey,
            serial: serialId,
            sizes: sizes.join(',') || undefined,
            warn: delivered ? undefined : 'no-kiosk',
        }, delivered ? OFFER_WAIT_MS : SCREEN_HOLD_MS),
    });
};

async function unsealPackage(
    locals: App.Locals,
    barSlug: string,
    tap: string,
    offerPackage: Package,
    at: string,
): Promise<TapScanResult> {
    const { offerItemKey, quantity } = offerPackage;
    const drink = await lookupDrink(locals, barSlug, offerItemKey);
    const name = drink?.name ?? offerItemKey;
    const label = offerPackage.label || formatQuantity(drink?.measure ?? 'volume', quantity);

    // Tapped again before anything got poured, it is the same package
    const before = await tapState(locals, barSlug, tap);
    const again = before.offerItemKey === offerItemKey
        && before.stock?.packageId === offerPackage.id
        && before.stock.left === before.stock.quantity;

    let staff = listenerCount(barSlug, 'staff');
    if (!again) {
        const id = randomUUID();
        staff = emit(locals, barSlug, {
            type: 'tap-unsealed',
            id,
            tap,
            offerItemKey,
            offerItemName: name,
            quantity,
            packageId: offerPackage.id,
            packageLabel: label,
            at,
        }, 'staff');

        // Nobody to file it, so it is not on the tap either
        if (staff) {
            await journal(locals, barSlug, {
                events: [{
                    type: 'unseal',
                    clientId: `${TAP_UNSEAL_PREFIX}${id}`,
                    offerItemKey,
                    occurredAt: at,
                    quantity,
                    tap,
                    packageId: offerPackage.id,
                    flushCurrent: true,
                }],
            });
            await broadcastTaps(locals, barSlug);
        }
    }

    const after = await tapState(locals, barSlug, tap);

    return {
        result: 'package',
        package: { offerItemKey, name, label, quantity },
        staff,
        ...await tapScreens(locals, barSlug, tap, {
            view: 'unsealed',
            tap,
            item: offerItemKey,
            label,
            left: after.stock?.left,
            total: after.stock?.quantity,
            warn: again || staff ? undefined : 'no-staff',
        }),
    };
}

const reply = (result: TapScanResult) => json(result);
