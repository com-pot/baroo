import z from 'zod';

/**
 * Messages between the TapTappers, the venue server, the kiosks and backstage
 *
 * A tap is a line at the bar, called by its id ("1", "levy"). It pours the offer item last
 * unsealed onto it. A TapTapper (PípaPípač) is the NFC station mounted at a tap - a Pico W
 * with an RC522 reader, and optionally a display and size buttons. It knows nothing of its
 * own: what the tap pours and how much is left, the venue server tells it.
 */

/** What the venue server knows of a tap */
export type TapState = {
    tap: string;
    /** `null` while nothing is on the tap */
    offerItemKey: string | null;
    /** The open stock of the item on tap */
    stock: TapStock | null;
    /** `null` when no TapTapper at the tap checked in lately */
    tapper: TapperStatus | null;
};

export type TapStock = {
    /** All the packages unsealed into the stock */
    quantity: number;
    left: number;
    unsealedAt: string;
    packageId: string | null;
};

export type TapperStatus = {
    lastSeenAt: string;
    /** Servings the TapTapper has a button for */
    buttons: string[];
};

/** Member card tapped at a TapTapper, waits for a serving from a kiosk or the TapTapper's buttons */
export type PendingOfferEvent = {
    type: 'pending-offer';
    /** Minted by the venue server, the order's clientId derives from it */
    id: string;
    tap: string;
    /** Normalized card serial */
    serialId: string;
    /** What the tap pours */
    offerItemKey: string;
    at: string;
};

/** A pending offer got its serving, `source` is where it was picked */
export type OfferServedEvent = {
    type: 'offer-served';
    id: string;
    tap: string;
    serialId: string;
    offerItemKey: string;
    /** Serving key */
    variant: string;
    at: string;
    /** A kiosk serving it filed the order already, one served at the TapTapper waits for the kiosks to */
    source: 'tapper' | 'kiosk';
};

export type OfferDismissedEvent = {
    type: 'offer-dismissed';
    id: string;
    tap: string;
    at: string;
};

/** Package tag tapped at a TapTapper - the tap pours a fresh package of its item now */
export type TapUnsealedEvent = {
    type: 'tap-unsealed';
    /** Minted by the venue server, the unseal's clientId derives from it */
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
    | { type: 'tap-unset'; tap: string; serialId: string; at: string };

/** Screen paths for the TapTapper display, ignored by TapTappers without one */
export type TapScreens = {
    screen: string;
    /** Returned to after `hold` ms */
    idle: string;
    hold: number;
};

export type TapScanResult = TapScreens & (
    /** `staff` - number of staff kiosks listening, nothing gets unsealed without one */
    | { result: 'package'; package: { offerItemKey: string; name: string; label: string; quantity: number }; staff: number }
    | { result: 'no-offer' }
    /** `sizes` - the buttons to answer, `delivered` - number of kiosks listening */
    | { result: 'offer'; offer: string; sizes: string[]; delivered: number }
);

/** `gone` - the offer was dismissed, or the server forgot it */
export type TapServeResult = TapScreens & { result: 'served' | 'gone'; delivered: number };

export type TapHelloResult = {
    ok: true;
    listeners: number;
    idle: string;
    /** Only once the offer asked about is not pending any more */
    offer?: TapScreens & { state: 'served' | 'gone' };
};

export const TAP_TICKET_HEADER = 'x-tap-ticket';

/** Three missed 30 s heartbeats */
export const TAP_STALE_MS = 90_000;

export const tapIdSchema = z.string().regex(/^[a-z0-9-]{1,16}$/);
const servingKey = z.string().regex(/^[0-9a-z_]{1,8}$/);
const cardUid = z.string().regex(/^[0-9a-f:]{4,40}$/i);

export const tapScanSchema = z.object({
    tap: tapIdSchema,
    uid: cardUid,
    /** Servings the TapTapper has a button for */
    buttons: z.array(servingKey).max(4).optional(),
});

export const tapServeSchema = z.object({
    tap: tapIdSchema,
    /** `offer` from the scan reply */
    offer: z.uuid(),
    /** Serving key */
    size: servingKey,
});

export const tapHelloSchema = z.object({
    tap: tapIdSchema,
    buttons: z.array(servingKey).max(4).optional(),
    /** The offer the TapTapper waits on, its state comes back once it is not pending */
    offer: z.uuid().optional(),
});

const relayedOpMeta = {
    clientId: z.string().min(1).max(80),
    occurredAt: z.iso.datetime(),
};

/** What a kiosk filed, so the TapTappers know before PocketBase does */
export const tapOpsSchema = z.object({
    ops: z.array(z.discriminatedUnion('kind', [
        z.object({
            ...relayedOpMeta,
            kind: z.literal('order'),
            items: z.array(z.object({ key: z.string().min(1), variant: servingKey })).min(1).max(50),
        }),
        z.object({
            ...relayedOpMeta,
            kind: z.literal('unseal'),
            offerItemKey: z.string().min(1),
            quantity: z.number().min(0),
            tap: tapIdSchema.nullish(),
            packageId: z.string().nullish(),
            flushCurrent: z.boolean(),
        }),
        z.object({
            ...relayedOpMeta,
            kind: z.literal('flush'),
            offerItemKey: z.string().min(1),
            tap: tapIdSchema.nullish(),
        }),
    ])).min(1).max(20),
});

export type RelayedOp = z.infer<typeof tapOpsSchema>["ops"][number];

export const tapDismissSchema = z.object({
    offer: z.uuid(),
});

/** clientId of the order filed for a pending offer */
export const TAP_ORDER_PREFIX = 'tap:';
/** clientId of the unseal filed for a package tag tapped at a TapTapper */
export const TAP_UNSEAL_PREFIX = 'tap-unseal:';
