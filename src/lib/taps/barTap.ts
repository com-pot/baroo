import * as m from '$lib/paraglide/messages.js';
import type { BarOfferItem } from '$lib/bar/BarModel';
import type { PosDevice } from '$lib/pos/device';

export const BarTapsCollection = 'bar_taps';

/**
 * A tap at the bar and the device mounted at it, prepared in backstage
 *
 * An auth record: the device signs in with the token issued on authorizing its config.
 */
export type BarTap = {
    id: string;
    bar: string;
    /** Events and kiosks call the tap by it, as a string */
    sequence: number;
    name: string;
    posDevice: string;
    /** Offer item last unsealed onto the tap, kept by the events hook */
    nowServing: string;
    model: string;
    config: unknown;
    /** Of the config file as last authorized, without its token */
    configChecksum: string;
    /** Expiry of the last token issued */
    validThrough: string;
    lastSeen: string;
    expand?: {
        nowServing?: BarOfferItem;
        posDevice?: Pick<PosDevice, 'id' | 'label'>;
    };
};

/** How events, unseals and kiosks refer to the tap */
export function tapRef(tap: Pick<BarTap, 'sequence'>): string {
    return String(tap.sequence);
}

/** e.g.: "Pípa 1", or its name */
export function tapLabel(tap: { sequence: number | string; name?: string | null }): string {
    return tap.name?.trim() || m['baroo.bar.tap.title']({ tap: String(tap.sequence) });
}
