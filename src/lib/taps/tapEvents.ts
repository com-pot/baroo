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

/** A serving of the item on tap, labeled for the TapTapper */
export type TapVariant = Pick<Serving, "key" | "label">

/** Member card tapped at a TapTapper, waits for a serving from a kiosk or the TapTapper's buttons */
export type PendingOfferEvent = {
    type: 'pending-offer';
    /** Minted by the server, the order's clientId derives from it */
    id: string;
    tap: string;
    /** Normalized card serial */
    serialId: string;
    member: { id: string; nickName: string };
    /** What the tap pours */
    offerItemKey: string;
    at: string;
};

/** A pending offer got its serving and the tap filed the order, `source` is where it was picked */
export type OfferServedEvent = {
    type: 'offer-served';
    id: string;
    tap: string;
    serialId: string;
    offerItemKey: string;
    /** Serving key */
    variant: string;
    at: string;
    source: 'tapper' | 'kiosk';
};

export type OfferDismissedEvent = {
    type: 'offer-dismissed';
    id: string;
    tap: string;
    at: string;
};

/** Package tag tapped at a TapTapper, which unsealed that package onto the tap */
export type TapUnsealedEvent = {
    type: 'tap-unsealed';
    id: string;
    tap: string;
    offerItemKey: string;
    offerItemName: string;
    quantity: number;
    packageId: string;
    packageLabel: string;
    at: string;
};

/**
 * Each event carries a unique id or `at` - the kiosk reads them through a svelte store
 * which drops values equal to the previous one.
 */
export type TapEvent =
    /** `at` is the server clock the `lastSeenAt`s are measured against */
    | { type: 'taps'; taps: TapState[]; at: string }
    | PendingOfferEvent
    | OfferServedEvent
    | OfferDismissedEvent
    | TapUnsealedEvent
    | { type: 'tap-unset'; tap: string; serialId: string; at: string }
    /** A card nobody is mapped to, the kiosk shows its serial */
    | { type: 'tap-unknown-card'; tap: string; serialId: string; at: string };

/** Screen paths for the TapTapper display, ignored by TapTappers without one */
export type TapScreens = {
    screen: string;
    /** Returned to after `hold` ms */
    idle: string;
    hold: number;
};

export type TapScanResult = TapScreens & (
    | { result: 'package'; package: { offerItemKey: string; name: string; label: string; quantity: number } }
    | { result: 'no-offer' }
    | { result: 'unknown-card' }
    /**
     * `variants` - what the item is offered in, the TapTapper's buttons answer them in order;
     * `delivered` - number of kiosks listening
     */
    | { result: 'offer'; offer: string; variants: TapVariant[]; delivered: number }
);

/** `gone` - the offer was dismissed, or the server forgot it */
export type TapServeResult = TapScreens & { result: 'served' | 'gone' };

export type TapHelloResult = {
    ok: true;
    /** What the TapTapper shows itself as, in plain ASCII */
    label: string;
    listeners: number;
    idle: string;
    /** Only once the offer asked about is not pending any more */
    offer?: TapScreens & { state: 'served' | 'gone' };
};

/** Three missed 20 s heartbeats */
export const TAP_STALE_MS = 60_000;

export const tapRefSchema = z.string().regex(/^[0-9]{1,3}$/);
const servingKey = z.string().regex(/^[0-9a-z_]{1,8}$/);
const cardUid = z.string().regex(/^[0-9a-f:]{4,40}$/i);

export const tapScanSchema = z.object({
    uid: cardUid,
});

export const tapServeSchema = z.object({
    /** `offer` from the scan reply */
    offer: z.uuid(),
    /** Serving key */
    variant: servingKey,
});

export const tapHelloSchema = z.object({
    /** The offer the TapTapper waits on, its state comes back once it is not pending */
    offer: z.uuid().optional(),
});

/** A kiosk picking the serving of a pending offer */
export const kioskServeSchema = z.object({
    variant: servingKey,
});

export const tapDismissSchema = z.object({
    offer: z.uuid(),
});

/** clientId of the order filed for a pending offer */
export const TAP_ORDER_PREFIX = 'tap:';
/** clientId of the unseal filed for a package tag tapped at a TapTapper */
export const TAP_UNSEAL_PREFIX = 'tap-unseal:';
