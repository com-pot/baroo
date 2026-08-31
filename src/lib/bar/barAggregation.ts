import type { BarOfferItem, BarOrderItem } from "./BarModel";
import { servingQuantity, servingsOf } from "./servings";

/**
 * Orders per serving. Every size the item's preset declares is seeded with a zero, so a
 * size nobody ordered still shows up. Anything else — the free-text variants of orders
 * placed before presets existed — collects in `_other_`.
 */
export function computeCountsByVariant(
    item: Pick<BarOfferItem, "servingPreset">,
    orderItems: Pick<BarOrderItem, "variant">[],
): Record<string, number> & { _other_?: number } {
    const variantCounts: Record<string, number> & { _other_?: number } = {};

    for (const serving of servingsOf(item)) {
        variantCounts[serving.key] = 0;
    }

    for (const orderItem of orderItems) {
        if (orderItem.variant in variantCounts) {
            variantCounts[orderItem.variant]++;
            continue;
        }
        variantCounts['_other_'] = (variantCounts['_other_'] || 0) + 1;
    }

    return variantCounts;
}

/**
 * How much came out of the package. `_other_` and any unknown key count for nothing —
 * they have no known size.
 */
export function computeTotalQuantity(
    item: Pick<BarOfferItem, "servingPreset">,
    variantCounts: Record<string, number>,
) {
    let total = 0;

    for (const [variant, count] of Object.entries(variantCounts)) {
        total += servingQuantity(item, variant) * count;
    }

    return total;
}
