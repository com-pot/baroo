import type { BaseModel } from "pocketbase";
import type { Bar, BarOfferItem, BarOrderItem, BarOrderItemRecord, BarEventRecord } from "../BarModel";
import { effectiveDate, toPbDate } from "../BarModel";
import { servingPreset, servingQuantity, type Measure } from "../servings";

/** Most recent unseal of an offer item, plus how many of its packages have been opened. */
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
        event: event || null,
        date: event ? effectiveDate(event) : null,
        count: list.totalItems > 0 ? list.totalItems : 1,
        /**
         * What the barman said was in it. Meaningless unless `date` is set — an empty
         * package is a legitimate `0`, so this can't double as "nobody has unsealed one".
         */
        quantity: event?.data.quantity ?? 0,
    };
}

/** Order items for an offer item, limited to the package currently open. */
async function getOrderItemsSinceUnseal(
    pb: NonNullable<App.Locals['pb']>,
    bar: Pick<Bar, "slug">,
    offerItemKey: string,
    sinceDate: string | null,
) {
    const clauses = [
        `key = "${offerItemKey}"`,
        `customer.bar.slug = "${bar.slug}"`, // Ensure order items are from this bar
    ];
    if (sinceDate) {
        // `sinceDate` is ISO; the stored column is in PocketBase's space-separated form,
        // and this comparison is textual — so it has to be translated back.
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
        lastUnsealAt: string | null,
        unsealCount: number,
        /** What the package currently open held, against which consumption is measured. */
        unsealQuantity: number,
        orderItems: BarOrderItemRecord[],
    }[] = []

    for (let offerItem of offerItemsRaw) {
        const unseal = await getLastUnseal(pb, bar, offerItem.key);
        const orderItemsList = await getOrderItemsSinceUnseal(pb, bar, offerItem.key, unseal.date);

        offerItems.push({
            data: offerItem,
            lastUnsealAt: unseal.date,
            unsealCount: unseal.count,
            unsealQuantity: unseal.quantity,
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

/**
 * Sums up the package currently open — everything ordered since the last unseal, in
 * total and per member. Called just before the next one is unsealed, so the numbers are
 * frozen into that event as the closing report of the package being replaced.
 */
export async function collectClosureData(
    pb: NonNullable<App.Locals['pb']>,
    bar: Pick<Bar, "slug">,
    offerItemKey: string,
) {
    // Get the offer item details
    const offerItem = await pb.collection<BarOfferItem>('bar_offer_items')
        .getFirstListItem(`bar.slug = "${bar.slug}" && key = "${offerItemKey}"`);

    const unseal = await getLastUnseal(pb, bar, offerItemKey);
    const orderItems = await getOrderItemsSinceUnseal(pb, bar, offerItemKey, unseal.date);

    // Calculate variant counts
    const variantCounts: Record<string, number> = {};
    for (const orderItem of orderItems) {
        variantCounts[orderItem.variant] = (variantCounts[orderItem.variant] || 0) + 1;
    }

    // Calculate how much of the package came out
    let totalQuantity = 0;
    for (const [variant, count] of Object.entries(variantCounts)) {
        totalQuantity += servingQuantity(offerItem, variant) * count;
    }

    // Calculate per-member consumption
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
        memberConsumption[memberId].quantity += servingQuantity(offerItem, orderItem.variant);
        memberConsumption[memberId].spent += offerItem.pricing?.[orderItem.variant] || 0;
    }

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
        /** What the package held, so the report can show what was left in it. */
        quantity: unseal.date ? unseal.quantity : null,
        /** Frozen with the report: the item's preset may be a different one by the time
         * anyone reads this back. */
        measure: servingPreset(offerItem).measure,
        variantCounts,
        totalQuantity: Math.round(totalQuantity * 100) / 100,
        totalOrders: orderItems.length,
        memberStats,
    };
}

/** How full one offer item's open package still is. */
export type OfferStock = {
    item: BarOfferItem;
    /** Litres or pieces — what both quantities below are counted in. */
    measure: Measure;
    /** When the open package was opened, or `null` if none ever was. */
    unsealedAt: string | null;
    /** What that package held. Meaningless unless `unsealedAt` is set. */
    unsealQuantity: number;
    /** How much of it the orders since account for. */
    consumed: number;
    /** What is left in it, or `null` while nothing has been unsealed. */
    left: number | null;
};

/**
 * What is still in each open package, from the orders alone.
 *
 * Pure, and deliberately so: the kiosk runs it against its snapshot plus outbox, where
 * an unseal that hasn't synced yet is still the newest package there is. Orders older
 * than the open package belong to one already emptied and count for nothing.
 */
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
        const measure = servingPreset(item).measure;

        const consumed = (ordersByKey.get(item.key) ?? [])
            .filter((orderItem) => !unseal || orderItem.orderedAt >= unseal.occurredAt)
            .reduce((total, orderItem) => total + servingQuantity(item, orderItem.variant), 0);

        return {
            item,
            measure,
            unsealedAt: unseal?.occurredAt ?? null,
            unsealQuantity: unseal?.quantity ?? 0,
            consumed: Math.round(consumed * 100) / 100,
            // Keyed off the unseal existing, not off a truthy quantity — a package that
            // turned out to be empty is a legitimate zero.
            left: unseal ? quantityLeft(unseal.quantity, consumed) : null,
        };
    });
}

export type AppEvent<T extends object = object> = {
    type: string;
    target: string;
    data: T;
} & BaseModel;

/** An `unseal` event: a package opened, carrying the closing report of the one before it. */
export type UnsealEvent = AppEvent<{
    offerItemKey: string;
    /** What the package being opened holds, in its preset's measure. */
    quantity: number;
    closureData: ClosureData;
}>

export type ClosureData = Awaited<ReturnType<typeof collectClosureData>>;

/** What is still in an open package, as far as the orders know. Never below zero. */
export function quantityLeft(quantity: number, consumed: number): number {
    return Math.max(0, Math.round((quantity - consumed) * 100) / 100);
}
