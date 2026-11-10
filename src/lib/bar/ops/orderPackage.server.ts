import type { Db } from '$lib/db.server';
import { toPbDate } from '$lib/pocketbase';
import { BarTapsCollection, type BarTap } from '$lib/taps/barTap';
import type { Bar, BarOfferItem, BarOfferPackage } from '../BarModel';

export type OrderSource = {
    tap: BarTap["id"] | '';
    package: BarOfferPackage["id"] | '',
};

/**
 * The tap an order was poured from and the package it drew from: the one open on the tap when
 * it was ordered, or the item's package off the taps for an order not poured from one
 *
 * Decided here rather than by the kiosk, which may not know of a package tapped meanwhile.
 * Mirrors `orderPackage` in src/lib/bar/stats/barOfferItems.ts.
 */
export async function resolveOrderSource(
    pb: Db,
    bar: Pick<Bar, "id">,
    order: { key: BarOfferItem["key"]; tap?: string | null; at: string },
): Promise<OrderSource> {
    const tap = order.tap
        ? await pb.collection<BarTap>(BarTapsCollection).getFirstListItem(
            pb.filter('bar = {:bar} && sequence = {:sequence}', { bar: bar.id, sequence: Number(order.tap) }),
            { fields: 'id' },
        ).catch(() => null)
        : null;

    const openAt = (slot: string) => pb.collection<BarOfferPackage>('bar_offer_packages').getFirstListItem(
        pb.filter(`offerItem.bar = {:bar} && offerItem.key = {:key} && ${slot}`
            + ' && unsealedAt != "" && unsealedAt <= {:at} && (flushedAt = "" || flushedAt > {:at})', {
            bar: bar.id,
            key: order.key,
            tap: tap?.id ?? '',
            at: toPbDate(order.at),
        }),
        { sort: '-unsealedAt', fields: 'id' },
    ).catch(() => null);

    const offerPackage = (tap ? await openAt('tap = {:tap}') : null) ?? await openAt('tap = ""');

    return { tap: tap?.id ?? '', package: offerPackage?.id ?? '' };
}
