
import type { Measure } from "$lib/si/measure";
import { indexBy } from "$lib/lists";
import { effectiveDate, type Bar, type BarOfferItem, type BarOrderItem } from "../BarModel";
import { findServing, servingPreset, type ServingPreset } from "../servings";
import type { UnsealEvent } from "../ops/unseal";
import type { FlushEvent } from "../ops/flush";

export async function getBarOfferIndex(
    pb: NonNullable<App.Locals['pb']>,
    bar: Pick<Bar, "slug">,
): Promise<BarOfferIndex> {
    const offerItems = await pb.collection<BarOfferItem>('bar_offer_items').getFullList({
        filter: `bar.slug = "${bar.slug}"`,
    });

    return indexBy("key", offerItems);
}

export type BarOfferIndex = Record<BarOfferItem["key"], BarOfferItem>;

/**
 * An unseal or a flush, as far as the stock of an offer item cares
 *
 * Unsealing adds a package to the item's stock, opening the stock when it was closed.
 * Flushing closes it: what is left is done with, and the taps pouring the item are free.
 */
export type StockEvent = {
    type: 'unseal' | 'flush';
    offerItemKey: BarOfferItem["key"];
    occurredAt: string;
    clientId?: string;
    /** The tap the package went on (unseal) or came off (flush) */
    tap?: string | null;
    /** Unseal only */
    quantity?: number;
    packageId?: string | null;
    /** Unseal only: the open stock is flushed first */
    flushCurrent?: boolean;
};

/** Stock of an offer item since it was last opened */
export type StockRun = {
    openedAt: string;
    /** All the packages unsealed into it */
    quantity: number;
    /** Package kind of the latest unseal */
    packageId: string | null;
};

export type TapAssignment = {
    tap: string;
    offerItemKey: BarOfferItem["key"];
    /** When the item went on the tap */
    since: string;
    packageId: string | null;
};

export function unsealStockEvent(event: UnsealEvent): StockEvent {
    return {
        type: 'unseal',
        offerItemKey: event.data.offerItemKey,
        occurredAt: effectiveDate(event),
        clientId: event.clientId || undefined,
        tap: event.data.tap ?? null,
        quantity: event.data.quantity,
        packageId: event.data.packageId ?? null,
        // Unseals from before flush events always started a fresh package
        flushCurrent: event.data.flushCurrent ?? true,
    };
}

export function flushStockEvent(event: FlushEvent): StockEvent {
    return {
        type: 'flush',
        offerItemKey: event.data.offerItemKey,
        occurredAt: effectiveDate(event),
        clientId: event.clientId || undefined,
        tap: event.data.tap ?? null,
    };
}

export function snapshotStockEvents(snapshot: {
    unseals: Record<string, UnsealEvent[]>;
    flushes?: Record<string, FlushEvent[]>;
}): StockEvent[] {
    return [
        ...Object.values(snapshot.unseals).flat().map(unsealStockEvent),
        ...Object.values(snapshot.flushes ?? {}).flat().map(flushStockEvent),
    ];
}

/** Within one instant the flush goes first, it closes what an unseal opens anew */
export function sortStockEvents(events: StockEvent[]): StockEvent[] {
    return events.toSorted((a, b) => a.occurredAt.localeCompare(b.occurredAt)
        || (a.type === b.type ? 0 : a.type === 'flush' ? -1 : 1));
}

/**
 * Plays the events in order: the open stock of each offer item, and what is on which tap
 *
 * A tap pours what was last unsealed onto it, until that item is flushed. Unsealing an item
 * onto another tap without flushing keeps it on the first one too.
 */
export function replayStock(events: StockEvent[]): {
    runs: Record<BarOfferItem["key"], StockRun>;
    taps: Record<string, TapAssignment>;
} {
    const runs: Record<string, StockRun> = {};
    const taps: Record<string, TapAssignment> = {};

    const close = (offerItemKey: string) => {
        delete runs[offerItemKey];
        for (const [tap, assignment] of Object.entries(taps)) {
            if (assignment.offerItemKey === offerItemKey) delete taps[tap];
        }
    };

    for (const event of sortStockEvents(events)) {
        const key = event.offerItemKey;
        if (event.type === 'flush') {
            close(key);
            continue;
        }

        if (event.flushCurrent) close(key);

        const packageId = event.packageId ?? null;
        const run = runs[key];
        if (run) {
            run.quantity += event.quantity ?? 0;
            run.packageId = packageId;
        } else {
            runs[key] = { openedAt: event.occurredAt, quantity: event.quantity ?? 0, packageId };
        }

        if (event.tap) {
            taps[event.tap] = { tap: event.tap, offerItemKey: key, since: event.occurredAt, packageId };
        }
    }

    return { runs, taps };
}

export type OfferStock = {
    item: BarOfferItem;
    measure: Measure;
    unsealedAt: string | null;
    unsealQuantity: number;
    consumed: number;
    left: number | null;
    /** Package kind of the latest unseal */
    packageId: string | null;
    /** Taps pouring the item */
    taps: string[];
};

export function computeOfferStock(input: {
    offerItems: BarOfferItem[];
    events: StockEvent[];
    orderItems: Pick<BarOrderItem, "key" | "variant" | "orderedAt">[];
}): OfferStock[] {
    const { offerItems, events, orderItems } = input;
    const { runs, taps } = replayStock(events);

    const ordersByKey = new Map<string, typeof orderItems>();
    for (const orderItem of orderItems) {
        const list = ordersByKey.get(orderItem.key);
        if (list) list.push(orderItem);
        else ordersByKey.set(orderItem.key, [orderItem]);
    }

    return offerItems.map((item) => {
        const run = runs[item.key] ?? null;
        const consumed = consumedSince(item.servingPreset, ordersByKey.get(item.key) ?? [], run?.openedAt ?? null);

        return {
            item,
            measure: servingPreset(item.servingPreset).measure,
            unsealedAt: run?.openedAt ?? null,
            unsealQuantity: run ? roundQuantity(run.quantity) : 0,
            consumed: roundQuantity(consumed),
            left: run ? quantityLeft(run.quantity, consumed) : null,
            packageId: run?.packageId ?? null,
            taps: Object.values(taps)
                .filter((assignment) => assignment.offerItemKey === item.key)
                .map((assignment) => assignment.tap)
                .sort(compareTaps),
        };
    });
}

/** What the orders since `since` drew, all of them without it */
export function consumedSince(
    preset: ServingPreset["key"],
    orderItems: Pick<BarOrderItem, "variant" | "orderedAt">[],
    since: string | null,
): number {
    return orderItems
        .filter((orderItem) => !since || orderItem.orderedAt >= since)
        .reduce((total, orderItem) => total + (findServing(preset, orderItem.variant)?.quantity ?? 0), 0);
}

export function quantityLeft(quantity: number, consumed: number): number {
    return Math.max(0, roundQuantity(quantity - consumed));
}

export function roundQuantity(quantity: number): number {
    return Math.round(quantity * 100) / 100;
}

/** "2" before "10" */
export function compareTaps(a: string, b: string): number {
    return a.localeCompare(b, undefined, { numeric: true });
}
