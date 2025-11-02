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

const variantToVolume: Record<string, number> = {
    'x': 0.3,
    '1': 0.5,
}

export function computeTotalVolume(variantCounts: Record<string, number>) {
    let totalVolume = 0;
    for (const [variant, count] of Object.entries(variantCounts)) {
        totalVolume += (variantToVolume[variant] || 0) * count;
    }

    return totalVolume;
}
