/**
 * The closed set of portions an offer item can be ordered in.
 *
 * Sizes used to be free text typed into the offer editor, spread across `pricing`,
 * `variantLabels` and `variantVolumes` — three maps that could disagree. An item now
 * declares one preset instead, and the preset decides both the orderable sizes and how
 * much of a package each one draws.
 */

/**
 * What a preset's quantities are counted in. Weight would be the third, the day someone
 * sells crisps by the gram.
 */
export type Measure = 'volume' | 'count';

export type Serving = {
    /** What lands in `bar_order_items.variant`. Decimals use `_`; that column is pattern-constrained. */
    key: string;
    /** The bare token as a human reads it: "0.3", "0.5", "1". */
    label: string;
    /** How much of a package one serving draws, in the preset's measure. */
    quantity: number;
};

export type ServingPresetKey = 'tap' | 'unit';

export type ServingPreset = {
    key: ServingPresetKey;
    /** How this preset's quantities read: litres from a tap, pieces out of a box. */
    measure: Measure;
    servings: readonly Serving[];
};

export const SERVING_PRESETS = {
    tap: {
        key: 'tap',
        measure: 'volume',
        servings: [
            { key: '0_3', label: '0.3', quantity: 0.3 },
            { key: '0_5', label: '0.5', quantity: 0.5 },
        ],
    },
    unit: {
        key: 'unit',
        measure: 'count',
        servings: [
            { key: '1', label: '1', quantity: 1 },
        ],
    },
} as const satisfies Record<ServingPresetKey, ServingPreset>;

export const SERVING_PRESET_KEYS = Object.keys(SERVING_PRESETS) as ServingPresetKey[];

/** Items saved before presets existed poured beer. Treat them as tap until re-entered. */
export const DEFAULT_SERVING_PRESET: ServingPresetKey = 'tap';

type WithPreset = { servingPreset?: string };

export function servingPreset(item: WithPreset): ServingPreset {
    return SERVING_PRESETS[item.servingPreset as ServingPresetKey]
        ?? SERVING_PRESETS[DEFAULT_SERVING_PRESET];
}

/** The sizes an item can be ordered in, in canonical display order. */
export function servingsOf(item: WithPreset): readonly Serving[] {
    return servingPreset(item).servings;
}

export function findServing(item: WithPreset, variant: string): Serving | undefined {
    return servingsOf(item).find(serving => serving.key === variant);
}

/**
 * How much of a package one serving of `variant` draws. Zero for the free-text variants
 * of pre-preset orders — those have no size anyone can still look up.
 */
export function servingQuantity(item: WithPreset, variant: string): number {
    return findServing(item, variant)?.quantity ?? 0;
}

/**
 * How a serving reads on its own: "0.3" for a pour, "1×" for a piece.
 *
 * Distinct from `Serving.label` because the kiosk button already prints its own `N ×`
 * before the size, and "2 × 1×" is nonsense. The `×` comes off the measure, not off the
 * quantity — a piece is worth 1, same as a litre would be.
 */
export function servingText(serving: Serving, measure: Measure): string {
    return measure === 'count' ? `${serving.label}×` : serving.label;
}

/** Label for a variant key against a known item. Unrecognised keys echo themselves. */
export function servingLabel(item: WithPreset, variant: string): string {
    const preset = servingPreset(item);
    const serving = preset.servings.find(candidate => candidate.key === variant);
    return serving ? servingText(serving, preset.measure) : variant;
}

/**
 * Label for a variant key with no item in hand — frozen closure reports and member
 * timelines carry only the key.
 *
 * Relies on serving keys not colliding across presets, which now decides formatting and
 * not just wording: a future `weight` preset reusing the key `1` would print grams as
 * "1×". Keep the keys distinct.
 */
export function labelForServingKey(variant: string): string {
    for (const preset of Object.values(SERVING_PRESETS)) {
        const serving = preset.servings.find(candidate => candidate.key === variant);
        if (serving) return servingText(serving, preset.measure);
    }
    return variant;
}
