import z from 'zod';
import { error, json } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import type { RequestHandler } from './$types';
import { formatQuantity } from '$lib/bar/quantity';
import { normalizeTag } from '$lib/bar/tags';
import { barDoUnseal } from '$lib/bar/ops/unseal';
import { requireTap, type TapSession } from '$lib/taps/tapAuth.server';
import { broadcastTaps, tapState } from '$lib/taps/tapBoard.server';
import { lookupCard, lookupDrink, lookupPackageTag, type Package } from '$lib/taps/tapLookup.server';
import { emit, openOffer } from '$lib/taps/tapHub.server';
import { OFFER_WAIT_MS, SCREEN_HOLD_MS, tapButtons, tapScreens } from '$lib/taps/tapScreens.server';
import { cardUid, TAP_UNSEAL_PREFIX, type TapScanResult } from '$lib/taps/tapEvents';

const tapScanSchema = z.object({
    uid: cardUid,
});

/**
 * Card tapped at a TapTapper
 *
 * A package tag unseals its package onto the tap. A member's card opens an
 * offer of what the tap pours, waiting for a serving from the TapTapper's buttons or a kiosk
 * (`../serve`, `../offers/[id]/serve`) - the tap files the order either way.
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
        emit(locals, barSlug, { type: 'tap-unset', tap, serialId, at });
        return reply({ result: 'no-offer', ...await tapScreens(session, { view: 'unset' }) });
    }

    const holder = await lookupCard(session.pb, barSlug, serialId);
    if (!holder) {
        // The kiosk shows its serial, for mapping it to someone
        emit(locals, barSlug, { type: 'tap-unknown-card', tap, serialId, at });
        return reply({ result: 'unknown-card', ...await tapScreens(session, { view: 'unknown-card', serial: serialId }) });
    }

    const offerItemKey = state.offerItemKey;
    const offer = openOffer(barSlug, {
        id: randomUUID(),
        barId: session.tap.bar.id,
        tap,
        serialId,
        memberId: holder.memberId,
        offerItemKey,
        at,
        pb: session.pb,
    });
    const delivered = emit(locals, barSlug, {
        type: 'pending-offer',
        id: offer.id,
        tap,
        serialId,
        member: { id: holder.memberId, nickName: holder.nickName },
        offerItemKey,
        at,
    });

    const drink = await lookupDrink(session.pb, barSlug, offerItemKey);
    const variants = drink?.servings ?? [];
    // The buttons answer the variants in order, the ones past the last button only a kiosk
    const sizes = variants
        .slice(0, tapButtons(session.tap).length)
        .map((variant) => variant.key)
    const answerable = delivered > 0 || sizes.length > 0;

    return reply({
        result: 'offer',
        offer: offer.id,
        variants,
        delivered,
        ...await tapScreens(session, {
            view: 'offer',
            item: offerItemKey,
            serial: serialId,
            sizes: sizes.join(',') || undefined,
            warn: answerable ? undefined : 'no-kiosk',
        }, answerable ? OFFER_WAIT_MS : SCREEN_HOLD_MS),
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
    const drink = await lookupDrink(session.pb, barSlug, offerItemKey);
    const name = drink?.name ?? offerItemKey;
    const label = offerPackage.label || formatQuantity(drink?.measure ?? 'volume', quantity);

    // Tapped again, the package is on the tap already
    const before = await tapState(session.pb, barSlug, tap);
    const again = before.stock?.packageId === offerPackage.id;

    if (!again) {
        const id = randomUUID();
        await barDoUnseal({ pb: session.pb }, barSlug, {
            offerItemKey,
            packageId: offerPackage.id,
            quantity,
            tap,
            clientId: `${TAP_UNSEAL_PREFIX}${id}`,
            occurredAt: at,
        });

        emit(locals, barSlug, {
            type: 'tap-unsealed',
            id,
            tap,
            offerItemKey,
            offerItemName: name,
            quantity,
            packageId: offerPackage.id,
            packageLabel: label,
            at,
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
