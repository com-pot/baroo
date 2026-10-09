import type { BaseModel } from "pocketbase";
import type { Bar, BarOfferItem, BarOrderItem, BarOrderItemRecord, BarEventRecord } from "../BarModel";
import { effectiveDate } from "../BarModel";
import { findServing, servingPreset } from "../servings";
import { toPbDate } from "$lib/pocketbase";
import type { Measure } from "$lib/si/measure";

async function getLastUnseal(
    pb: NonNullable<App.Locals['pb']>,
    bar: Pick<Bar, "slug">,
    offerItemKey: string,
) {
    const list = await pb.collection<BarEventRecord<{ offerItemKey: string; quantity?: number }>>('events')
        .getList(1, 1, {
            filter: `type = "unseal" && target = "bar:${bar.slug}" && data.offerItemKey = "${offerItemKey}"`,
            sort: '-occurredAt',
        });

    const event = list.items[0];
    return {
        // event: event || null,
        date: event ? effectiveDate(event) : null,
        count: list.totalItems > 0 ? list.totalItems : 1,
        quantity: event?.data.quantity ?? 0,
    };
}

async function getOrderItemsSinceUnseal(
    pb: NonNullable<App.Locals['pb']>,
    bar: Pick<Bar, "slug">,
    offerItemKey: string,
    sinceDate: string | null,
) {
    const clauses = [
        `key = "${offerItemKey}"`,
        `customer.bar.slug = "${bar.slug}"`,
    ];
    if (sinceDate) {
        clauses.push(`orderedAt >= "${toPbDate(sinceDate)}"`);
    }

    return await pb.collection<BarOrderItemRecord>('bar_order_items')
        .getFullList({
            filter: clauses.join(' && '),
            expand: 'customer',
        });
}

export async function getBarOfferItems(
    pb: NonNullable<App.Locals['pb']>,
    bar: Pick<Bar, "slug">,
) {
    const offerItemsRaw = await pb.collection<BarOfferItem>('bar_offer_items')
        .getFullList({
            filter: `bar.slug = "${bar.slug}"`,
            sort: 'name',
        })

    const offerItems: {
        data: typeof offerItemsRaw[0],
        lastUnseal: Awaited<ReturnType<typeof getLastUnseal>>,
        orderItems: BarOrderItemRecord[],
    }[] = []

    for (let offerItem of offerItemsRaw) {
        const unseal = await getLastUnseal(pb, bar, offerItem.key);
        const orderItemsList = await getOrderItemsSinceUnseal(pb, bar, offerItem.key, unseal.date);

        offerItems.push({
            data: offerItem,
            lastUnseal: unseal,
            orderItems: orderItemsList,
        })
    }

    return offerItems
}

export async function getBarOfferIndex(
    pb: NonNullable<App.Locals['pb']>,
    bar: Pick<Bar, "slug">,
): Promise<Record<BarOfferItem["key"], BarOfferItem>> {
    const offerItems = await pb.collection<BarOfferItem>('bar_offer_items').getFullList({
        filter: `bar.slug = "${bar.slug}"`,
    });

    return indexBarOffer(offerItems);
}

/** Pure: keys an offer list by item key. The kiosk uses this on its snapshot. */
export function indexBarOffer(offerItems: BarOfferItem[]): BarOfferIndex {
    return Object.fromEntries(offerItems.map(item => [item.key, item]));
}

export type BarOfferIndex = Record<BarOfferItem["key"], BarOfferItem>;

export async function collectClosureData(
    pb: NonNullable<App.Locals['pb']>,
    bar: Pick<Bar, "slug">,
    offerItemKey: string,
) {
    const offerItem = await pb.collection<BarOfferItem>('bar_offer_items')
        .getFirstListItem(`bar.slug = "${bar.slug}" && key = "${offerItemKey}"`);

    const unseal = await getLastUnseal(pb, bar, offerItemKey);
    const orderItems = await getOrderItemsSinceUnseal(pb, bar, offerItemKey, unseal.date);

    const variantCounts: Record<string, number> = {};
    for (const orderItem of orderItems) {
        variantCounts[orderItem.variant] = (variantCounts[orderItem.variant] || 0) + 1;
    }

    let totalQuantity = 0;
    for (const [variant, count] of Object.entries(variantCounts)) {
        totalQuantity += findServing(offerItem.key, variant)?.quantity ?? 0 * count;
    }

    const memberConsumption = calculateMemberConsumption(offerItem, orderItems)

    // Convert to array and sort by consumption
    const memberStats = Object.values(memberConsumption)
        .map(member => ({
            ...member,
            quantity: Math.round(member.quantity * 100) / 100, // Round to 2 decimals
            spent: Math.round(member.spent),
        }))
        .sort((a, b) => b.quantity - a.quantity);

    return {
        offerItemKey,
        offerItemName: offerItem.name,
        unsealedAt: unseal.date,
        quantity: unseal.date ? unseal.quantity : null,
        measure: servingPreset(offerItem.servingPreset).measure,
        variantCounts,
        totalQuantity: Math.round(totalQuantity * 100) / 100,
        totalOrders: orderItems.length,
        memberStats,
    };
}

function calculateMemberConsumption(offerItem: BarOfferItem, orderItems: BarOrderItem[]) {
    const memberConsumption: Record<string, {
        memberId: string;
        memberName: string;
        count: number;
        quantity: number;
        spent: number;
    }> = {};

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
                spent: 0,
            };
        }

        memberConsumption[memberId].count += 1;
        memberConsumption[memberId].quantity += findServing(offerItem.servingPreset, orderItem.variant)?.quantity ?? 0;
        memberConsumption[memberId].spent += offerItem.pricing?.[orderItem.variant] || 0;
    }

    return memberConsumption
}

export type OfferStock = {
    item: BarOfferItem;
    measure: Measure;
    unsealedAt: string | null;
    unsealQuantity: number;
    consumed: number;
    left: number | null;
};

export function computeOfferStock(input: {
    offerItems: BarOfferItem[];
    unseals: Record<BarOfferItem["key"], { occurredAt: string; quantity: number }>;
    orderItems: Pick<BarOrderItem, "key" | "variant" | "orderedAt">[];
}): OfferStock[] {
    const { offerItems, unseals, orderItems } = input;

    const ordersByKey = new Map<string, typeof orderItems>();
    for (const orderItem of orderItems) {
        const list = ordersByKey.get(orderItem.key);
        if (list) list.push(orderItem);
        else ordersByKey.set(orderItem.key, [orderItem]);
    }

    return offerItems.map((item) => {
        const unseal = unseals[item.key] ?? null;
        const measure = servingPreset(item.servingPreset).measure;

        const consumed = (ordersByKey.get(item.key) ?? [])
            .filter((orderItem) => !unseal || orderItem.orderedAt >= unseal.occurredAt)
            .reduce((total, orderItem) => total + (findServing(item.servingPreset, orderItem.variant)?.quantity ?? 0), 0);

        return {
            item,
            measure,
            unsealedAt: unseal?.occurredAt ?? null,
            unsealQuantity: unseal?.quantity ?? 0,
            consumed: Math.round(consumed * 100) / 100,
            left: unseal ? quantityLeft(unseal.quantity, consumed) : null,
        };
    });
}

export type AppEvent<T extends object = object> = {
    type: string;
    target: string;
    data: T;
} & BaseModel;

export type ClosureData = Awaited<ReturnType<typeof collectClosureData>>;

export function quantityLeft(quantity: number, consumed: number): number {
    return Math.max(0, Math.round((quantity - consumed) * 100) / 100);
}
