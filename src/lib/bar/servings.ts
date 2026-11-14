import { listIndex } from "$lib/lists";
import type { Measure } from "$lib/si/measure";
import type { Locale } from "$lib/paraglide/runtime.js";
import type { BarOfferItem } from "./BarModel";
import { measureLabel } from "./quantity";

export type Serving = {
    /** e.g.: 0_5 */
    key: string;
    /** e.g.: Pint */
    label: string;
    /** e.g.: 0.5 */
    quantity: number;
    /** price in bars default currency */
    price: number;
    /** e.g.: { cs: "Velké", en: "Large" } */
    name: Record<string, string>;
};

/** Pre-fills an offer item's measure and servings on the offer form, the item keeps no link to it */
export type ServingPreset = {
    key: string;
    label: Record<string, string>,
    props: Pick<BarOfferItem, "measure" | "servings">
};

export const SERVING_PRESETS = listIndex("key", [
    {
        key: 'tap',
        label: {
            cs: "Čepované",
            en: "On tap",
        },
        props: {
            measure: 'volume',
            servings: [
                { key: '0_3', label: '0.3', name: { cs: 'Malé', en: 'Small' }, quantity: 0.3, price: 0 },
                { key: '0_5', label: '0.5', name: { cs: 'Velké', en: 'Large' }, quantity: 0.5, price: 0 },
            ],
        },
    },
    {
        key: 'unit',
        label: {
            cs: "Kusové",
            en: "By the piece",
        },
        props: {
            measure: 'count',
            servings: [
                { key: '1', label: '1', name: { cs: 'Kus', en: 'Piece' }, quantity: 1, price: 0 },
            ],
        },
    },
] as const satisfies ServingPreset[]);


export function applyPreset(target: Pick<BarOfferItem, "measure" | "servings">, key: string) {
    const preset = SERVING_PRESETS.index[key as keyof typeof SERVING_PRESETS["index"]];
    if (!preset) return;

    target.measure = preset.props.measure;
    target.servings = preset.props.servings.map((serving) => ({
        ...serving,
        name: { ...serving.name },
    }));
}

export function servingText(serving: Serving, measure: Measure, locale?: Locale): string {
    return `${serving.label}${measureLabel(measure, locale)}`
}
