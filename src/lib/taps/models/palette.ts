import type { ListOption } from "$lib/ui/zchem/optionsLists";

export const BUTTON_PALETTE = [
    { value: 0, label: 'yellow', fill: '#facc15', text: '#111827' },
    { value: 1, label: 'red', fill: '#dc2626', text: '#f9fafb' },
    { value: 2, label: 'green', fill: '#16a34a', text: '#f9fafb' },
    { value: 3, label: 'blue', fill: '#2563eb', text: '#f9fafb' },
    { value: 4, label: 'white', fill: '#f9fafb', text: '#111827' },
    { value: 5, label: 'black', fill: '#111827', text: '#f9fafb' },
] as const satisfies readonly (ListOption<number> & Record<string, unknown>)[];

export type ButtonColor = (typeof BUTTON_PALETTE)[number];

export function buttonColor(index: number): ButtonColor {
    return BUTTON_PALETTE[index] ?? BUTTON_PALETTE[0];
}
