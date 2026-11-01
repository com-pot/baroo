import { listIndex } from "$lib/lists";
import type { Measure } from "$lib/si/measure";
import type { BarOfferItem } from "./BarModel";
import { measureLabel } from "./quantity";

export type Serving = {
    /** e.g.: 0_5 */
    key: string;
    /** e.g.: Pint */
    label: string;
    /** e.g.: 0.5 */
    quantity: number;
    /** e.g.: { cs: "Velké", en: "Large" } */
    name: Record<string, string>;
};

export type ServingPreset = {
    key: string;
    measure: Measure;
    label: Record<string, string>,
    servings: readonly Serving[];
};

export const SERVING_PRESETS = listIndex("key", [
    {
        key: 'tap',
        measure: 'volume',
        label: {
            cs: "Čepované",
            en: "On tap",
        },
        servings: [
            { key: '0_3', label: '0.3', name: { cs: 'Malé', en: 'Small' }, quantity: 0.3 },
            { key: '0_5', label: '0.5', name: { cs: 'Velké', en: 'Large' }, quantity: 0.5 },
        ],
    },
    {
        key: 'unit',
        measure: 'count',
        label: {
            cs: "Kusové",
            en: "By the piece",
        },
        servings: [
            { key: '1', label: '1', name: { cs: 'Kus', en: 'Piece' }, quantity: 1 },
        ],
    },
] as const satisfies ServingPreset[]);

export function servingPreset(key: ServingPreset["key"]): ServingPreset {
    const preset = SERVING_PRESETS.index[key as keyof typeof SERVING_PRESETS["index"]]
    if (!preset) {
        throw new Error(`No serving preset "${key}"`)
    }

    return preset
}

export function findServing(key: ServingPreset["key"], variant: string): Serving | undefined {
    return servingPreset(key).servings.find(serving => serving.key === variant);
}

/** Priced servings, or all of them when the item has no prices */
export function offeredServings(item: Pick<BarOfferItem, "servingPreset" | "pricing">): readonly Serving[] {
    const all = servingPreset(item.servingPreset).servings;
    const priced = all.filter((serving) => item.pricing?.[serving.key] != null);
    return priced.length ? priced : all;
}

export function servingText(serving: Serving, measure: Measure): string {
    return `${serving.label}${measureLabel(measure)}`
}

export function servingLabel(key: ServingPreset["key"], variant: string): string {
    const preset = servingPreset(key);
    const serving = preset.servings.find(candidate => candidate.key === variant);
    return serving ? servingText(serving, preset.measure) : variant;
}
