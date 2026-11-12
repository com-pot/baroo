import * as m from '$lib/paraglide/messages.js';
import { getLocale, type Locale } from '$lib/paraglide/runtime.js';
import { knownMeasures, type Measure } from '$lib/si/measure';

export function formatQuantity(measure: Measure, quantity: number, locale: Locale = getLocale()): string {
    const quantityStr = new Intl.NumberFormat(locale, {
        maximumFractionDigits: measure === 'count' ? 0 : 1,
    }).format(quantity);

    return `${quantityStr} ${measureLabel(measure, locale)}`;
}

/** e.g.: "Sud · 50 l", just "50 l" without a label */
export function packageLabel(offerPackage: { label: string; quantity: number }, measure: Measure): string {
    const amount = formatQuantity(measure, offerPackage.quantity);
    return offerPackage.label ? `${offerPackage.label} · ${amount}` : amount;
}

export function measureLabel(measure: Measure, locale?: Locale): string {
    if (!measure || !knownMeasures.index[measure]) measure = "count"
    return m[`generic.measure.mode.${measure}`]({}, { locale })
}
