import type { BarOrderItem } from "./BarModel";
import { type Serving } from "./servings";

export function computeCountsByVariant(
    servings: Readonly<Serving[]>,
    orderItems: Pick<BarOrderItem, "variant">[],
): Record<string, number> & { _other_?: number } {
    const variantCounts: Record<Serving["key"], number> & { _other_?: number } = {};

    for (const serving of servings) {
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

export function computeTotalQuantity(
    servings: Readonly<Serving[]>,
    variantCounts: Record<string, number>,
) {
    let total = 0;

    for (const [variant, count] of Object.entries(variantCounts)) {
        const serving = servings.find((serving) => serving.key === variant)
        total += serving?.quantity ?? 0 * count;
    }

    return total;
}
