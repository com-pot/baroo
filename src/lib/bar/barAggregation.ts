import type { BarOfferItem, BarOrderItem } from "./BarModel";

export function computeCountsByVariant(pricing: BarOfferItem["pricing"], orderItems: BarOrderItem[]) {
    const variantCounts: Record<string, number> & { _other_?: number } = {};

    for (let key of Object.keys(pricing)) {
        variantCounts[key] = 0;
    }

    orderItems.forEach((item: BarOrderItem) => {
        const variant = item.variant;
        if (variant in variantCounts) {
            variantCounts[variant]++;
            return
        }
        variantCounts['_other_'] = (variantCounts['_other_'] || 0) + 1;
    });

    return variantCounts;
}

export function computeTotalVolume(
    variantCounts: Record<string, number>,
    variantVolumes?: Record<string, number>
) {
    let totalVolume = 0;

    for (const [variant, count] of Object.entries(variantCounts)) {
        const volumeInLiters = variantVolumes?.[variant]
            ? variantVolumes[variant] / 1000
            : 0;

        totalVolume += volumeInLiters * count;
    }

    return totalVolume;
}
