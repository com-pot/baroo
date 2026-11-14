import z from 'zod';
import * as m from '$lib/paraglide/messages.js';
import { error, json } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import type { RequestHandler } from './$types';
import { formatQuantity } from '$lib/bar/quantity';
import { tagSerialSchema } from '$lib/bar/tags';
import { barDoUnseal } from '$lib/bar/ops/unseal';
import { requireTap, type TapSession } from '$lib/taps/tapAuth.server';
import { broadcastTaps, tapState } from '$lib/taps/tapBoard.server';
import { lookupCard, lookupPackageTag, lookupPackageUnseals, type Package } from '$lib/taps/tapLookup.server';
import { openOffer, OFFER_WAIT_MS } from '$lib/taps/tapOffers.server';
import { tapButtons, tapScreen } from '$lib/taps/tapScreens.server';
import { TAP_UNSEAL_PREFIX, type TapScanResult } from '$lib/taps/tapEvents';
import { getBarOfferItem } from '$lib/bar/stats/barOfferItems';

const tapScanSchema = z.object({
    serial: tagSerialSchema,
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
    if (!body.success) error(400, 'expected { serial }');

    const serialId = body.data.serial;
    const at = new Date().toISOString();
    const tap = session.ref;

    const offerPackage = await lookupPackageTag(session.pb, barSlug, serialId);
    if (offerPackage) {
        return reply(await unsealPackage(locals, session, offerPackage, at));
    }

    const state = await tapState(session.pb, barSlug, tap);
    if (!state.offerItemKey) {
        return reply({
            result: 'error',
            error: 'no-offer',
            screen: tapScreen(session, {
                view: 'error',
                text: m['baroo.tap_screen.unset_title']({}, { locale: locals.i18n.locale }),
                hint: m['baroo.tap_screen.tap_package_tag']({}, { locale: locals.i18n.locale }),
            }),
        });
    }

    const holder = await lookupCard(session.pb, barSlug, serialId);
    if (!holder) {
        return reply({ result: 'unknown-card', screen: tapScreen(session, { view: 'unknown-card', serial: serialId }) });
    }

    const offerItemKey = state.offerItemKey;
    const drink = await getBarOfferItem(session.pb, barSlug, offerItemKey);
    // The buttons answer the servings in order, the ones past the last button are not on offer here
    const variants = (drink?.servings ?? [])
        .slice(0, tapButtons(session.tap).length)

    if (!variants.length) {
        return reply({
            result: 'error',
            error: 'no-sizes',
            screen: tapScreen(session, {
                view: 'error',
                text: m['baroo.tap_screen.no_sizes']({}, { locale: locals.i18n.locale }),
                hint: m['baroo.tap_screen.no_sizes_hint']({}, { locale: locals.i18n.locale }),
            }),
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
    });

    return reply({
        result: 'offer',
        offer: offer.id,
        variants,
        screen: tapScreen(session, {
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
        // A package does not move across taps, only once flushed it may be reopened - e.g.: off a broken tap
        const unseals = await lookupPackageUnseals(session.pb, barSlug, offerPackage.id);
        if (unseals.open) {
            const { locale } = locals.i18n;
            return {
                result: 'error',
                error: 'package-open',
                screen: tapScreen(session, {
                    view: 'error',
                    text: unseals.open.data.tap
                        ? m['baroo.tap_screen.already_on_tap']({ tap: unseals.open.data.tap }, { locale })
                        : m['baroo.tap_screen.already_open']({}, { locale }),
                }),
            };
        }

        await barDoUnseal({ pb: session.pb }, barSlug, {
            offerItemKey,
            packageId: offerPackage.id,
            quantity,
            tap,
            // One unseal per package and opening, however often the reader reports the tag
            clientId: `${TAP_UNSEAL_PREFIX}${offerItemKey}:${offerPackage.id}${unseals.count ? `:${unseals.count}` : ''}`,
            occurredAt: at,
        });

        await broadcastTaps({...locals, pb: session.pb}, barSlug);
    }

    const after = await tapState(session.pb, barSlug, tap);

    return {
        result: 'package',
        package: { offerItemKey, name, label, quantity },
        screen: tapScreen(session, {
            view: 'unsealed',
            item: offerItemKey,
            label,
            left: after.stock?.left,
            total: after.stock?.quantity,
        }),
    };
}

const reply = (result: TapScanResult) => json(result);
