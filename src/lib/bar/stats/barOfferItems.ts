
import type { Measure } from "$lib/si/measure";
import { indexBy } from "$lib/lists";
import { packageState, type Bar, type BarOfferItem, type BarOfferPackage, type BarOrderItem, type OfferPackage } from "../BarModel";
import type { BarTap } from "$lib/taps/barTap";

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

/** An order as far as stock cares, `package` is the one it drew from */
export type StockOrder = Pick<BarOrderItem, "key" | "variant" | "orderedAt"> & { package?: string | null };

export type TapAssignment = {
    tap: string;
    offerItemKey: BarOfferItem["key"];
    since: string;
    packageId: BarOfferPackage["id"];
};

/** What goes on a package unsealed, ISO dates */
export type PackageUnseal = {
    packageId: BarOfferPackage["id"];
    offerItemKey: BarOfferItem["key"];
    quantity: number;
    label?: string;
    tap: BarTap["id"] | null;
    at: string;
};

/**
 * One package is open per slot: a tap, or an item's packages off the taps. Unsealing another
 * one there flushes what was open - unless it got unsealed later, a kiosk syncing late
 * does not get to close it.
 */
function sameSlot(a: Pick<OfferPackage, "offerItemKey" | "tap">, b: Pick<OfferPackage, "offerItemKey" | "tap">): boolean {
    return a.tap || b.tap ? a.tap === b.tap : a.offerItemKey === b.offerItemKey;
}

/**
 * The packages after an unseal: the package open in its slot, whatever was open there before
 * it flushed. A package not known yet is registered by it.
 *
 * Mirrored by `barDoUnseal` in src/lib/bar/ops/unseal.ts, which writes it down.
 */
export function applyUnseal(packages: OfferPackage[], unseal: PackageUnseal): OfferPackage[] {
    const known = packages.find((offerPackage) => offerPackage.id === unseal.packageId);
    const opened: OfferPackage = {
        ...(known ?? {
            id: unseal.packageId,
            offerItemKey: unseal.offerItemKey,
            label: unseal.label ?? '',
            quantity: unseal.quantity,
            tagSerial: '',
        }),
        tap: unseal.tap,
        unsealedAt: unseal.at,
        flushedAt: '',
    };

    const rivals = packages.filter((offerPackage) => offerPackage.id !== opened.id
        && packageState(offerPackage) === 'unsealed'
        && sameSlot(offerPackage, opened));
    const newer = rivals
        .filter((offerPackage) => offerPackage.unsealedAt > unseal.at)
        .sort((a, b) => a.unsealedAt.localeCompare(b.unsealedAt))[0];
    if (newer) opened.flushedAt = newer.unsealedAt;

    return [
        ...packages
            .filter((offerPackage) => offerPackage.id !== opened.id)
            .map((offerPackage) => rivals.includes(offerPackage) && offerPackage.unsealedAt <= unseal.at
                ? { ...offerPackage, flushedAt: unseal.at }
                : offerPackage),
        opened,
    ];
}

export function applyFlush(packages: OfferPackage[], flush: { packageId: BarOfferPackage["id"]; at: string }): OfferPackage[] {
    return packages.map((offerPackage) => {
        if (offerPackage.id === flush.packageId && packageState(offerPackage) === 'unsealed') {
            return { ...offerPackage, flushedAt: flush.at }
        }
        return offerPackage
    })
}

/**
 * The package an order drew from: open on its tap when it was ordered, or the item's package
 * off the taps for an order not poured from one
 *
 * Mirrored by `resolveOrderSource` in src/lib/bar/ops/orderPackage.server.ts.
 */
export function orderPackage(
    packages: OfferPackage[],
    order: { key: BarOfferItem["key"]; tap?: string | null; at: string },
): OfferPackage | null {
    const openAt = (offerPackage: OfferPackage) => offerPackage.offerItemKey === order.key
        && !!offerPackage.unsealedAt && offerPackage.unsealedAt <= order.at
        && (!offerPackage.flushedAt || offerPackage.flushedAt > order.at);
    const latest = (tap: string | null) => packages
        .filter((offerPackage) => openAt(offerPackage) && (offerPackage.tap ?? null) === tap)
        .sort((a, b) => b.unsealedAt.localeCompare(a.unsealedAt))[0];

    return (order.tap ? latest(order.tap) : undefined) ?? latest(null) ?? null;
}

/** What is on which tap */
export function tapAssignments(packages: OfferPackage[]): TapAssignment[] {
    return packages
        .filter((offerPackage) => offerPackage.tap && packageState(offerPackage) === 'unsealed')
        .map((offerPackage) => ({
            tap: offerPackage.tap!,
            offerItemKey: offerPackage.offerItemKey,
            since: offerPackage.unsealedAt,
            packageId: offerPackage.id,
        }))
        .sort((a, b) => compareTaps(a.tap, b.tap));
}

/** An open package with what is left of it, or an item with nothing open */
export type OfferStock = {
    item: BarOfferItem;
    measure: Measure;
    /** `null` while nothing of the item is open */
    package: OfferPackage | null;
    consumed: number;
    /** `null` while nothing of the item is open */
    left: number | null;
};

/** Each open package, on taps first; an entry with no package for the items with none */
export function computeOfferStock(input: {
    offerItems: BarOfferItem[];
    packages: OfferPackage[];
    orderItems: StockOrder[];
}): OfferStock[] {
    const { offerItems, packages, orderItems } = input;

    const ordersByPackage = new Map<string, StockOrder[]>();
    for (const orderItem of orderItems) {
        if (!orderItem.package) continue;
        const list = ordersByPackage.get(orderItem.package);
        if (list) list.push(orderItem);
        else ordersByPackage.set(orderItem.package, [orderItem]);
    }

    const open = packages
        .filter((offerPackage) => packageState(offerPackage) === 'unsealed')
        .sort((a, b) => a.tap || b.tap
            ? (!b.tap ? -1 : !a.tap ? 1 : compareTaps(a.tap, b.tap))
            : b.unsealedAt.localeCompare(a.unsealedAt));

    return offerItems.flatMap((item): OfferStock[] => {
        const measure = item.measure;
        const own = open.filter((offerPackage) => offerPackage.offerItemKey === item.key);
        if (!own.length) return [{ item, measure, package: null, consumed: 0, left: null }];

        return own.map((offerPackage) => {
            const consumed = consumedBy(item, ordersByPackage.get(offerPackage.id) ?? []);
            return {
                item,
                measure,
                package: offerPackage,
                consumed: roundQuantity(consumed),
                left: quantityLeft(offerPackage.quantity, consumed),
            };
        });
    });
}

/** What the orders drew */
export function consumedBy(
    offerItem: Pick<BarOfferItem, "servings">,
    orderItems: Pick<BarOrderItem, "variant">[],
): number {
    let total = 0
    for (const orderItem of orderItems) {
        total += offerItem.servings.find((serving) => serving.key === orderItem.variant)?.quantity ?? 0
    }
    return total
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

/** A package id minted before PocketBase saw the package, in its own format */
export function newPackageId(): string {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = crypto.getRandomValues(new Uint8Array(15));
    return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}
