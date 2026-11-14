import { listIndex } from "$lib/lists";

type MeasureSpec = {
    name: string,
    inputMode: HTMLInputElement["inputMode"],
    step: number,
    maximumFractionDigits: number,
}
export const knownMeasures = listIndex("name", [
    {
        name: 'volume',
        inputMode: "decimal",
        step: 0.1,
        maximumFractionDigits: 1,
    },
    {
        name: 'count',
        inputMode: "numeric",
        step: 1,
        maximumFractionDigits: 0,
    },
] as const satisfies MeasureSpec[])
export type KnownMeasure = typeof knownMeasures["items"][number]
export type Measure = KnownMeasure["name"];

export function getMeasure<T extends Measure>(measure?: T): KnownMeasure {
    return knownMeasures.index[measure ?? 'volume'] ?? knownMeasures.index.volume
}
