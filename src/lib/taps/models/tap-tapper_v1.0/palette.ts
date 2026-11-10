/**
 * Colors a TapTapper's size buttons come in, by index - `palette.py` in the firmware keeps
 * the same order, so only ever append
 */
export const BUTTON_PALETTE = [
    { key: 'yellow', fill: '#facc15', text: '#111827' },
    { key: 'red', fill: '#dc2626', text: '#f9fafb' },
    { key: 'green', fill: '#16a34a', text: '#f9fafb' },
    { key: 'blue', fill: '#2563eb', text: '#f9fafb' },
    { key: 'white', fill: '#f9fafb', text: '#111827' },
    { key: 'black', fill: '#111827', text: '#f9fafb' },
] as const;

export type ButtonColor = (typeof BUTTON_PALETTE)[number];

/** Unknown indices fall back to the first color */
export function buttonColor(index: number): ButtonColor {
    return BUTTON_PALETTE[index] ?? BUTTON_PALETTE[0];
}
