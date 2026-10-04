
import type { Measure } from "$lib/si/measure";
import { indexBy } from "$lib/lists";
import type { Bar, BarOfferItem, BarOrderItem, BarOrderItemRecord } from "../BarModel";
import { findServing, servingPreset } from "../servings";
import { getLastUnseal, getOrderItemsSinceUnseal } from "../ops/unseal";

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

    return indexBy("key", offerItems);
}

export type BarOfferIndex = Record<BarOfferItem["key"], BarOfferItem>;

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

export function quantityLeft(quantity: number, consumed: number): number {
    return Math.max(0, Math.round((quantity - consumed) * 100) / 100);
}
