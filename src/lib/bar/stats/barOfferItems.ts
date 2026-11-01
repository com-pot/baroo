
import type { Measure } from "$lib/si/measure";
import { indexBy } from "$lib/lists";
import type { Bar, BarOfferItem, BarOrderItem } from "../BarModel";
import { findServing, servingPreset } from "../servings";
import type { UnsealEvent } from "../ops/unseal";

export async function getBarOfferIndex(
    pb: NonNullable<App.Locals['pb']>,
    bar: Pick<Bar, "slug">,
): Promise<BarOfferIndex> {
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
    unseals: Record<BarOfferItem["key"], UnsealEvent[]>;
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
        const unseal = unseals[item.key]?.at(-1) ?? null;
        const measure = servingPreset(item.servingPreset).measure;
        const unsealQuantity = unseal?.data?.quantity

        const consumed = (ordersByKey.get(item.key) ?? [])
            .filter((orderItem) => !unseal || orderItem.orderedAt >= unseal.occurredAt)
            .reduce((total, orderItem) => total + (findServing(item.servingPreset, orderItem.variant)?.quantity ?? 0), 0);

        return {
            item,
            measure,
            unsealedAt: unseal?.occurredAt ?? null,
            unsealQuantity: unsealQuantity ?? 0,
            consumed: Math.round(consumed * 100) / 100,
            left: typeof unsealQuantity === "number" ? quantityLeft(unsealQuantity, consumed) : null,
        };
    });
}

export function quantityLeft(quantity: number, consumed: number): number {
    return Math.max(0, Math.round((quantity - consumed) * 100) / 100);
}
