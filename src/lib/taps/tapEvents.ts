import type { Serving } from '$lib/bar/servings';
import z from 'zod';

/**
 * Messages between the TapTappers, the server, the kiosks and backstage
 *
 * A tap is a line at the bar, prepared in backstage and called by its sequence number. It
 * pours the package last unsealed onto it, until that is flushed. A TapTapper (PípaPípač) is the NFC station
 * mounted at a tap - a Pico W with an RC522 reader, and optionally a display and size
 * buttons. It knows nothing of its own and works online only: what the tap pours and how
 * much is left, the server tells it, and whatever it does goes straight to PocketBase.
 */

/** What is known of a tap */
export type TapState = {
    /** Sequence number, as events refer to the tap */
    tap: string;
    /** e.g.: "Pípa 1", or the tap's name */
    label: string;
    /** `null` while nothing is on the tap */
    offerItemKey: string | null;
    /** The package on the tap */
    stock: TapStock | null;
    /** When the TapTapper last checked in, `null` when never */
    lastSeenAt: string | null;
};

/** The package on the tap */
export type TapStock = {
    quantity: number;
    left: number;
    unsealedAt: string;
    packageId: string;
};

export type TapEvent =
    /** `at` is the server clock the `lastSeenAt`s are measured against */
    | { type: 'taps'; taps: TapState[]; at: string };

export type TapScreen = {
    path: string;
    hold: number;
};

export type TapScreens = {
    screen: TapScreen | null;
};

export type TapScanResult = TapScreens & (
    | { result: 'package'; package: { offerItemKey: string; name: string; label: string; quantity: number } }
    | { result: 'unknown-card' }
    /**
     * `no-offer` - a member's card, but nothing is on the tap
     * `no-sizes` - a member's card, but the TapTapper has no buttons for the item's servings
     * `package-open` - a package tag, but the package is open elsewhere
     */
    | { result: 'error'; error: 'no-offer' | 'no-sizes' | 'package-open' }
    /** `variants` - what the TapTapper's buttons answer, in their order */
    | { result: 'offer'; offer: string; variants: readonly Pick<Serving, "key" | "label">[] }
);

export type TapHelloResult = {
    label: string;
};

export const TAP_STALE_MS = 60_000;

export const tapRefSchema = z.string().regex(/^[0-9]{1,3}$/);
export const servingKey = z.string().regex(/^[0-9a-z_]{1,8}$/);


/** clientId of the order filed for an offer served on a TapTapper's buttons */
export const TAP_ORDER_PREFIX = 'tap:';
/** clientId of the unseal filed for a package tag tapped at a TapTapper */
export const TAP_UNSEAL_PREFIX = 'tap-unseal:';
