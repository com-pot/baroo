import type { Db } from '$lib/db.server';
import { toIsoDate } from '$lib/pocketbase';
import type { BarOfferItem, BarOfferPackage, BarOrderItemRecord } from '$lib/bar/BarModel';
import { compareTaps, consumedBy, quantityLeft, roundQuantity } from '$lib/bar/stats/barOfferItems';
import { BarTapsCollection, tapLabel, tapRef, type BarTap } from './barTap';
import { emit } from './tapHub.server';
import type { TapState } from './tapEvents';


/**
 * What is on each tap and how much of it is left, as PocketBase has it
 *
 * `pb` may be a tap's, a kiosk's or a bar manager's.
 */
export function tapStates(pb: Db, barSlug: string): Promise<TapState[]> {
    return readTapStates(pb, barSlug);
}

export async function tapState(pb: Db, barSlug: string, tap: string): Promise<TapState> {
    return (await tapStates(pb, barSlug)).find((state) => state.tap === tap)
        ?? { tap, label: tapLabel({ sequence: tap }), offerItemKey: null, stock: null, lastSeenAt: null };
}

/** Tells every listener what is on the taps now */
export async function broadcastTaps(ctx: Pick<App.Locals, "logger">, pb: Db, barSlug: string): Promise<void> {
    emit(ctx, barSlug, { type: 'taps', taps: await tapStates(pb, barSlug), at: new Date().toISOString() });
}

async function readTapStates(pb: Db, barSlug: string): Promise<TapState[]> {
    const [taps, open] = await Promise.all([
        pb.collection<BarTap>(BarTapsCollection).getFullList({
            filter: pb.filter('bar.slug = {:barSlug}', { barSlug }),
            fields: 'id,sequence,name,lastSeen',
        }),
        pb.collection<BarOfferPackage & { expand?: { offerItem?: Pick<BarOfferItem, 'key' | 'servings'> } }>('bar_offer_packages').getFullList({
            filter: pb.filter('offerItem.bar.slug = {:barSlug} && tap != "" && unsealedAt != "" && flushedAt = ""', { barSlug }),
            sort: '-unsealedAt',
            expand: 'offerItem',
            fields: 'id,tap,quantity,unsealedAt,expand.offerItem.key,expand.offerItem.servingPreset',
        }),
    ]);

    // The latest one, should a late unseal have left another open
    const onTap = new Map<string, typeof open[number]>();
    for (const offerPackage of open) {
        if (!onTap.has(offerPackage.tap)) onTap.set(offerPackage.tap, offerPackage);
    }
    const orders = await readPackageOrders(pb, [...onTap.values()].map((offerPackage) => offerPackage.id));

    return taps
        .map((tap): TapState => {
            const offerPackage = onTap.get(tap.id);
            const item = offerPackage?.expand?.offerItem;

            return {
                tap: tapRef(tap),
                label: tapLabel(tap),
                offerItemKey: item?.key ?? null,
                stock: offerPackage && item
                    ? {
                        quantity: roundQuantity(offerPackage.quantity),
                        left: quantityLeft(offerPackage.quantity, consumedBy(item, orders.filter((order) => order.package === offerPackage.id))),
                        unsealedAt: toIsoDate(offerPackage.unsealedAt),
                        packageId: offerPackage.id,
                    }
                    : null,
                lastSeenAt: toIsoDate(tap.lastSeen) || null,
            };
        })
        .sort((a, b) => compareTaps(a.tap, b.tap));
}

async function readPackageOrders(pb: Db, packageIds: string[]) {
    if (!packageIds.length) return [];

    const filter = packageIds.map((_, i) => `package = {:package${i}}`).join(' || ');
    const params = Object.fromEntries(packageIds.map((id, i) => [`package${i}`, id]));

    return pb.collection<BarOrderItemRecord>('bar_order_items').getFullList({
        filter: pb.filter(filter, params),
        fields: 'package,variant',
    });
}
