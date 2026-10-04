import { listIndex } from "$lib/lists";

type MeasureSpec = {
    name: string,
    inputMode: HTMLInputElement["inputMode"],
}
export const knownMeasures = listIndex("name", [
    {
        name: 'volume',
        inputMode: "decimal",
    },
    {
        name: 'count',
        inputMode: "numeric",
    },
] as const satisfies MeasureSpec[])
export type Measure = keyof typeof knownMeasures["index"];
