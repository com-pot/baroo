import type { AppEvent } from "$lib/model/event";
import { toIsoDate, toPbDate } from "$lib/pocketbase";
import type { Measure } from "$lib/si/measure";
import { tapRef, type BarTap } from "$lib/taps/barTap";
import { packageState, type Bar, type BarOfferItem, type BarOfferPackage, type BarOrderItemRecord } from "../BarModel";
import { findServing, servingPreset } from "../servings";
import { roundQuantity } from "../stats/barOfferItems";

type Pb = NonNullable<App.Locals['pb']>;

export type FlushEvent = AppEvent<{
    offerItemKey: string;
    tap?: BarTap["id"] | null;
    packageId?: BarOfferPackage["id"] | null;
    closureData: ClosureData;
}>

/**
 * Closes an unsealed package, keeping what it came to as its closure data
 *
 * Does nothing when the package is not open, or when the flush is recorded already.
 */
export async function barDoFlush(
    ctx: Pick<App.Locals, "pb">,
    slug: Bar["slug"],
    data: { packageId: string; clientId?: string; occurredAt?: string },
): Promise<FlushEvent | null> {
    const { pb } = ctx;
    const occurredAt = data.occurredAt ?? new Date().toISOString();

    if (data.clientId && await eventExists(pb, data.clientId)) return null;

    const offerPackage = await pb.collection<BarOfferPackage & { expand?: { offerItem?: BarOfferItem; tap?: BarTap } }>('bar_offer_packages').getFirstListItem(
        pb.filter('id = {:id} && offerItem.bar.slug = {:slug}', { id: data.packageId, slug }),
        { expand: 'offerItem,tap' },
    ).catch(() => null);
    const offerItem = offerPackage?.expand?.offerItem;
    if (!offerPackage || !offerItem || packageState(offerPackage) !== 'unsealed') return null;

    const closureData = await collectClosureData(pb, offerItem, offerPackage);
    await pb.collection('bar_offer_packages').update(offerPackage.id, { flushedAt: toPbDate(occurredAt) });

    return await pb.collection<FlushEvent>('events').create({
        type: 'flush',
        target: `bar:${slug}`,
        occurredAt,
        clientId: data.clientId,
        data: {
            offerItemKey: offerItem.key,
            tap: offerPackage.expand?.tap ? tapRef(offerPackage.expand.tap) : null,
            packageId: offerPackage.id,
            closureData,
        },
    } satisfies Omit<FlushEvent, "id" | "created">)
}

export type ClosureData = {
    offerItemKey: string;
    offerItemName: string;
    /** `null` when nobody unsealed the package, only on unseals from before flush events */
    unsealedAt: string | null;
    quantity: number | null;
    measure: Measure;
    variantCounts: Record<string, number>;
    totalQuantity: number;
    totalOrders: number;
    memberStats: MemberConsumption[];
};

type MemberConsumption = {
    memberId: string;
    memberName: string;
    count: number;
    quantity: number;
};

/** What the package's orders drew from it */
export async function collectClosureData(
    pb: Pb,
    offerItem: BarOfferItem,
    offerPackage: Pick<BarOfferPackage, "id" | "quantity" | "unsealedAt">,
): Promise<ClosureData> {
    const orderItems = await pb.collection<BarOrderItemRecord>('bar_order_items').getFullList({
        filter: pb.filter('package = {:package}', { package: offerPackage.id }),
        expand: 'customer',
    });

    const variantCounts: Record<string, number> = {};
    for (const orderItem of orderItems) {
        variantCounts[orderItem.variant] = (variantCounts[orderItem.variant] || 0) + 1;
    }

    let totalQuantity = 0;
    for (const [variant, count] of Object.entries(variantCounts)) {
        totalQuantity += (findServing(offerItem.servingPreset, variant)?.quantity ?? 0) * count;
    }

    const memberStats = Object.values(calculateMemberConsumption(offerItem, orderItems))
        .map(member => ({
            ...member,
            quantity: roundQuantity(member.quantity),
        }))
        .sort((a, b) => b.quantity - a.quantity);

    return {
        offerItemKey: offerItem.key,
        offerItemName: offerItem.name,
        unsealedAt: toIsoDate(offerPackage.unsealedAt) || null,
        quantity: roundQuantity(offerPackage.quantity),
        measure: servingPreset(offerItem.servingPreset).measure,
        variantCounts,
        totalQuantity: roundQuantity(totalQuantity),
        totalOrders: orderItems.length,
        memberStats,
    };
}

function calculateMemberConsumption(offerItem: BarOfferItem, orderItems: BarOrderItemRecord[]) {
    const memberConsumption: Record<string, MemberConsumption> = {};

    for (const orderItem of orderItems) {
        const customer = (orderItem as any).expand?.customer;
        if (!customer) continue;

        const memberId = customer.id;
        const memberName = customer.nickName || customer.id;

        if (!memberConsumption[memberId]) {
            memberConsumption[memberId] = {
                memberId,
                memberName,
                count: 0,
                quantity: 0,
            };
        }

        memberConsumption[memberId].count += 1;
        memberConsumption[memberId].quantity += findServing(offerItem.servingPreset, orderItem.variant)?.quantity ?? 0;
    }

    return memberConsumption
}

async function eventExists(pb: Pb, clientId: string): Promise<boolean> {
    const found = await pb.collection('events').getFirstListItem(
        pb.filter('clientId = {:clientId}', { clientId }),
    ).catch(() => null);

    return !!found;
}
