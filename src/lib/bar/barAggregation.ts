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

const defaultVariantToVolume: Record<string, number> = {
    'x': 0.3,
    '1': 0.5,
}

// Generic fallback volume for variants without specific volumes (500ml = 0.5L)
const DEFAULT_VOLUME_LITERS = 0.5;

export function computeTotalVolume(
    variantCounts: Record<string, number>, 
    variantVolumes?: Record<string, number>
) {
    let totalVolume = 0;
    
    for (const [variant, count] of Object.entries(variantCounts)) {
        // Use custom variant volumes if provided, otherwise fall back to defaults
        // Convert ML to liters by dividing by 1000
        const volumeInLiters = variantVolumes?.[variant] 
            ? variantVolumes[variant] / 1000 
            : (defaultVariantToVolume[variant] || DEFAULT_VOLUME_LITERS);
        
        totalVolume += volumeInLiters * count;
    }

    return totalVolume;
}
