import * as m from '$lib/paraglide/messages.js';
import { getLocale } from '$lib/paraglide/runtime.js';
import { knownMeasures, type Measure } from '$lib/si/measure';

export function formatQuantity(measure: Measure, quantity: number): string {
    const quantityStr = new Intl.NumberFormat(getLocale(), {
        maximumFractionDigits: measure === 'count' ? 0 : 1,
    }).format(quantity);

    return `${quantityStr} ${measureLabel(measure)}`;
}

export function measureLabel(measure: Measure): string {
    if (!measure || !knownMeasures.index[measure]) measure = "count"
    return m[`generic.measure.${measure}`]()
}
