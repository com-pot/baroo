import type { AppEvent } from "$lib/model/event";
import { toIsoDate, toPbDate } from "$lib/pocketbase";
import { BarTapsCollection, type BarTap } from "$lib/taps/barTap";
import { type Bar, type BarOfferItem, type BarOfferPackage } from "../BarModel";
import { barDoFlush, type ClosureData } from "./flush";

export type UnsealData = {
    offerItemKey: string;
    /**
     * The registered package to unseal, or the id of one to register - a kiosk mints it
     * before it syncs. Left out, a package gets registered under a new id.
     */
    packageId?: BarOfferPackage["id"] | null;
    quantity: number;
    label?: string;
    tap?: string | null;
}

/**
 * Opens the package in its slot - its tap, or its item's packages off the taps - flushing
 * whatever was open there before. One unsealed later stays, closing this one right away.
 *
 * Mirrors `applyUnseal` in src/lib/bar/stats/barOfferItems.ts.
 */
export async function barDoUnseal(
    ctx: Pick<App.Locals, "pb">,
    slug: Bar["slug"],
    data: UnsealData & { clientId?: string; occurredAt?: string },
): Promise<BarOfferPackage> {
    const { pb } = ctx;
    const { clientId, occurredAt = new Date().toISOString(), ...unseal } = data;

    const item = await pb.collection<BarOfferItem & { bar: string }>('bar_offer_items')
        .getFirstListItem(pb.filter('bar.slug = {:slug} && key = {:key}', { slug, key: unseal.offerItemKey }));
    const tap = unseal.tap
        ? await pb.collection<BarTap>(BarTapsCollection)
            .getFirstListItem(pb.filter('bar = {:bar} && sequence = {:sequence}', { bar: item.bar, sequence: Number(unseal.tap) }))
        : null;

    const registered = unseal.packageId
        ? await pb.collection<BarOfferPackage>('bar_offer_packages').getOne(unseal.packageId).catch(() => null)
        : null;
    if (registered && registered.offerItem !== item.id) throw new Error(`package ${registered.id} is not of ${item.key}`);
    const offerPackage = registered ?? await pb.collection<BarOfferPackage>('bar_offer_packages').create<BarOfferPackage>({
        ...(unseal.packageId ? { id: unseal.packageId } : {}),
        offerItem: item.id,
        label: unseal.label ?? '',
        quantity: unseal.quantity,
    });

    const rivals = await pb.collection<BarOfferPackage>('bar_offer_packages').getFullList({
        filter: tap
            ? pb.filter('tap = {:tap} && unsealedAt != "" && flushedAt = "" && id != {:id}', { tap: tap.id, id: offerPackage.id })
            : pb.filter('offerItem = {:item} && tap = "" && unsealedAt != "" && flushedAt = "" && id != {:id}', { item: item.id, id: offerPackage.id }),
        sort: 'unsealedAt',
    });
    const newer = rivals.find((rival) => toIsoDate(rival.unsealedAt) > occurredAt);

    for (const rival of rivals) {
        if (rival === newer) break;
        await barDoFlush(ctx, slug, {
            packageId: rival.id,
            clientId: clientId && `${clientId}:flush:${rival.id}`,
            occurredAt,
        });
    }

    const unsealed = await pb.collection<BarOfferPackage>('bar_offer_packages').update(offerPackage.id, {
        tap: tap?.id ?? '',
        unsealedAt: toPbDate(occurredAt),
        flushedAt: '',
    });

    await pb.collection('events')
        .create({
            type: 'unseal',
            target: `bar:${slug}`,
            occurredAt,
            clientId,
            data: {
                offerItemKey: unseal.offerItemKey,
                quantity: unsealed.quantity,
                tap: unseal.tap ?? null,
                packageId: unsealed.id,
            },
        } satisfies Omit<UnsealEvent, "id" | "created">)

    if (newer) {
        // Was replaced before this unseal got here
        await barDoFlush(ctx, slug, {
            packageId: offerPackage.id,
            clientId: clientId && `${clientId}:flush:${offerPackage.id}`,
            occurredAt: toIsoDate(newer.unsealedAt),
        });
    }

    return unsealed;
}

export type UnsealEvent = AppEvent<Omit<UnsealData, "label" | "packageId"> & {
    /** Missing on unseals from before packages were registered */
    packageId?: string | null;
    /** Only on unseals from before packages: whether the item's open stock was flushed first */
    flushCurrent?: boolean;
    /** Closure of the package an unseal from before flush events replaced */
    closureData?: ClosureData;
}>
