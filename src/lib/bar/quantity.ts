import * as m from '$lib/paraglide/messages.js';
import { getLocale } from '$lib/paraglide/runtime.js';
import type { Measure } from './servings';

/**
 * A quantity as it should be read, unit and all: "17,5 l", "7 ks".
 *
 * The only module in `$lib` that speaks i18n. It exists so that `servings.ts` and
 * `barAggregation.ts` — both reached from server code — never have to, while the markup
 * still gets its unit from somewhere other than a hardcoded "L".
 */
export function formatQuantity(measure: Measure, quantity: number): string {
    return `${formatNumber(measure, quantity)} ${measureLabel(measure)}`;
}

/** Litres read to a decimal; pieces are whole things. Locale-aware — Czech wants a comma. */
export function formatNumber(measure: Measure, quantity: number): string {
    return new Intl.NumberFormat(getLocale(), {
        maximumFractionDigits: measure === 'count' ? 0 : 1,
    }).format(quantity);
}

/** The unit on its own, for a column header that repeats it on every row. */
export function measureLabel(measure: Measure): string {
    // A report frozen before its preset existed has no measure; litres is the older
    // assumption and the safer thing to show.
    return measure === 'count' ? m['generic.measure.count']() : m['generic.measure.volume']();
}

/**
 * A byte count as a person reads it: "980 B", "12,4 kB". Decimal units, because that is
 * what a file picker and an upload limit are both quoted in.
 */
export function formatBytes(bytes: number): string {
    if (bytes < 1000) return `${bytes} B`;

    const units = ['kB', 'MB', 'GB'];
    let value = bytes / 1000;
    let unit = 0;

    while (value >= 1000 && unit < units.length - 1) {
        value /= 1000;
        unit++;
    }

    return `${new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 1 }).format(value)} ${units[unit]}`;
}
