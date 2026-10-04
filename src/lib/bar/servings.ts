import { listIndex } from "$lib/lists";
import type { Measure } from "$lib/si/measure";
import { measureLabel } from "./quantity";

export type Serving = {
    /** e.g.: 0_5 */
    key: string;
    /** e.g.: Pint */
    label: string;
    /** e.g.: 0.5 */
    quantity: number;
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
            { key: '0_3', label: '0.3', quantity: 0.3 },
            { key: '0_5', label: '0.5', quantity: 0.5 },
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
            { key: '1', label: '1', quantity: 1 },
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

export function servingText(serving: Serving, measure: Measure): string {
    return `${serving.label}${measureLabel(measure)}`
}

export function servingLabel(key: ServingPreset["key"], variant: string): string {
    const preset = servingPreset(key);
    const serving = preset.servings.find(candidate => candidate.key === variant);
    return serving ? servingText(serving, preset.measure) : variant;
}
