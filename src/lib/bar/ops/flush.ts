import type { AppEvent } from "$lib/model/event";
import { toPbDate } from "$lib/pocketbase";
import type { Measure } from "$lib/si/measure";
import { type Bar, type BarOfferItem, type BarOrderItemRecord } from "../BarModel";
import { findServing, servingPreset } from "../servings";
import { flushStockEvent, replayStock, roundQuantity, unsealStockEvent, type StockEvent, type StockRun } from "../stats/barOfferItems";
import type { UnsealEvent } from "./unseal";

type Pb = NonNullable<App.Locals['pb']>;

export type FlushEvent = AppEvent<{
    offerItemKey: string;
    /** The tap the item came off, if it was on one */
    tap?: string | null;
    closureData: ClosureData;
}>

/**
 * Closes the open stock of an offer item, keeping what it came to as its closure data
 *
 * Does nothing when the item has no open stock, or when the flush is recorded already.
 */
export async function barDoFlush(
    ctx: Pick<App.Locals, "pb">,
    slug: Bar["slug"],
    data: { offerItemKey: string; tap?: string | null; clientId?: string; occurredAt?: string },
): Promise<FlushEvent | null> {
    const { pb } = ctx;
    const occurredAt = data.occurredAt ?? new Date().toISOString();

    if (data.clientId && await eventExists(pb, data.clientId)) return null;

    const { runs, taps } = replayStock(await getStockEvents(pb, { slug }, data.offerItemKey, occurredAt));
    const run = runs[data.offerItemKey];
    if (!run) return null;

    const tap = data.tap
        ?? Object.values(taps).find((assignment) => assignment.offerItemKey === data.offerItemKey)?.tap
        ?? null;

    return await pb.collection<FlushEvent>('events').create({
        type: 'flush',
        target: `bar:${slug}`,
        occurredAt,
        clientId: data.clientId,
        data: {
            offerItemKey: data.offerItemKey,
            tap,
            closureData: await collectClosureData(pb, { slug }, data.offerItemKey, run, occurredAt),
        },
    } satisfies Omit<FlushEvent, "id">)
}

export type ClosureData = {
    offerItemKey: string;
    offerItemName: string;
    /** `null` when nobody unsealed the package, only on unseals from before flush events */
    unsealedAt: string | null;
    quantity: number | null;
    measure: Measure;
    variantCounts: Record<string, number>;
    totalQuantity: number;
    totalOrders: number;
    memberStats: MemberConsumption[];
};

type MemberConsumption = {
    memberId: string;
    memberName: string;
    count: number;
    quantity: number;
};

export async function collectClosureData(
    pb: Pb,
    bar: Pick<Bar, "slug">,
    offerItemKey: string,
    run: StockRun,
    until: string,
): Promise<ClosureData> {
    const offerItem = await pb.collection<BarOfferItem>('bar_offer_items')
        .getFirstListItem(pb.filter('bar.slug = {:slug} && key = {:key}', { slug: bar.slug, key: offerItemKey }));

    const orderItems = await getOrderItemsBetween(pb, bar, offerItemKey, run.openedAt, until);

    const variantCounts: Record<string, number> = {};
    for (const orderItem of orderItems) {
        variantCounts[orderItem.variant] = (variantCounts[orderItem.variant] || 0) + 1;
    }

    let totalQuantity = 0;
    for (const [variant, count] of Object.entries(variantCounts)) {
        totalQuantity += (findServing(offerItem.servingPreset, variant)?.quantity ?? 0) * count;
    }

    const memberStats = Object.values(calculateMemberConsumption(offerItem, orderItems))
        .map(member => ({
            ...member,
            quantity: roundQuantity(member.quantity),
        }))
        .sort((a, b) => b.quantity - a.quantity);

    return {
        offerItemKey,
        offerItemName: offerItem.name,
        unsealedAt: run.openedAt,
        quantity: roundQuantity(run.quantity),
        measure: servingPreset(offerItem.servingPreset).measure,
        variantCounts,
        totalQuantity: roundQuantity(totalQuantity),
        totalOrders: orderItems.length,
        memberStats,
    };
}

function calculateMemberConsumption(offerItem: BarOfferItem, orderItems: BarOrderItemRecord[]) {
    const memberConsumption: Record<string, MemberConsumption> = {};

    for (const orderItem of orderItems) {
        const customer = (orderItem as any).expand?.customer;
        if (!customer) continue;

        const memberId = customer.id;
        const memberName = customer.nickName || customer.id;

        if (!memberConsumption[memberId]) {
            memberConsumption[memberId] = {
                memberId,
                memberName,
                count: 0,
                quantity: 0,
            };
        }

        memberConsumption[memberId].count += 1;
        memberConsumption[memberId].quantity += findServing(offerItem.servingPreset, orderItem.variant)?.quantity ?? 0;
    }

    return memberConsumption
}

/** The item's unseals and flushes up to `until` */
async function getStockEvents(
    pb: Pb,
    bar: Pick<Bar, "slug">,
    offerItemKey: string,
    until: string,
): Promise<StockEvent[]> {
    const events = await pb.collection<UnsealEvent | FlushEvent>('events')
        .getFullList({
            filter: pb.filter('(type = "unseal" || type = "flush") && target = {:target} && data.offerItemKey = {:key} && occurredAt <= {:until}', {
                target: `bar:${bar.slug}`,
                key: offerItemKey,
                until: toPbDate(until),
            }),
            sort: 'occurredAt',
        });

    return events.map((event) => event.type === 'flush'
        ? flushStockEvent(event as FlushEvent)
        : unsealStockEvent(event as UnsealEvent));
}

export async function getOrderItemsBetween(
    pb: Pb,
    bar: Pick<Bar, "slug">,
    offerItemKey: string,
    since: string,
    until: string,
) {
    return await pb.collection<BarOrderItemRecord>('bar_order_items')
        .getFullList({
            filter: pb.filter('key = {:key} && customer.bar.slug = {:slug} && orderedAt >= {:since} && orderedAt < {:until}', {
                key: offerItemKey,
                slug: bar.slug,
                since: toPbDate(since),
                until: toPbDate(until),
            }),
            expand: 'customer',
        });
}

async function eventExists(pb: Pb, clientId: string): Promise<boolean> {
    const found = await pb.collection('events').getFirstListItem(
        pb.filter('clientId = {:clientId}', { clientId }),
    ).catch(() => null);

    return !!found;
}
