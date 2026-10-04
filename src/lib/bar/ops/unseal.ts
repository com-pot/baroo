import type { AppEvent } from "$lib/model/event";
import { toPbDate } from "$lib/pocketbase";
import { effectiveDate, type Bar, type BarEventRecord, type BarOfferItem, type BarOrderItem, type BarOrderItemRecord } from "../BarModel";
import { findServing, servingPreset } from "../servings";

type UnsealData = {
    offerItemKey: BarOfferItem["key"],
    quantity: number,
}

export async function barDoUnseal(ctx: Pick<App.Locals, "pb">, slug: Bar["slug"], data: UnsealData) {
    const closureData = await collectClosureData(ctx.pb, { slug }, data.offerItemKey);

    await ctx.pb.collection('events')
        .create({
            type: 'unseal',
            target: `bar:${slug}`,
            occurredAt: new Date().toISOString(),
            data: {
                offerItemKey: data.offerItemKey,
                quantity: data.quantity,
                closureData,
            },
        } satisfies Omit<UnsealEvent, "id">)
}

export type UnsealEvent = AppEvent<{
    offerItemKey: string;
    quantity: number;
    closureData: ClosureData;
}>

export async function collectClosureData(
    pb: NonNullable<App.Locals['pb']>,
    bar: Pick<Bar, "slug">,
    offerItemKey: string,
) {
    const offerItem = await pb.collection<BarOfferItem>('bar_offer_items')
        .getFirstListItem(`bar.slug = "${bar.slug}" && key = "${offerItemKey}"`);

    const unseal = await getLastUnseal(pb, bar, offerItemKey);
    const orderItems = await getOrderItemsSinceUnseal(pb, bar, offerItemKey, unseal.date);

    const variantCounts: Record<string, number> = {};
    for (const orderItem of orderItems) {
        variantCounts[orderItem.variant] = (variantCounts[orderItem.variant] || 0) + 1;
    }

    let totalQuantity = 0;
    for (const [variant, count] of Object.entries(variantCounts)) {
        totalQuantity += findServing(offerItem.key, variant)?.quantity ?? 0 * count;
    }

    const memberConsumption = calculateMemberConsumption(offerItem, orderItems)

    // Convert to array and sort by consumption
    const memberStats = Object.values(memberConsumption)
        .map(member => ({
            ...member,
            quantity: Math.round(member.quantity * 100) / 100, // Round to 2 decimals
            spent: Math.round(member.spent),
        }))
        .sort((a, b) => b.quantity - a.quantity);

    return {
        offerItemKey,
        offerItemName: offerItem.name,
        unsealedAt: unseal.date,
        quantity: unseal.date ? unseal.quantity : null,
        measure: servingPreset(offerItem.servingPreset).measure,
        variantCounts,
        totalQuantity: Math.round(totalQuantity * 100) / 100,
        totalOrders: orderItems.length,
        memberStats,
    };
}

function calculateMemberConsumption(offerItem: BarOfferItem, orderItems: BarOrderItem[]) {
    const memberConsumption: Record<string, {
        memberId: string;
        memberName: string;
        count: number;
        quantity: number;
        spent: number;
    }> = {};

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
                spent: 0,
            };
        }

        memberConsumption[memberId].count += 1;
        memberConsumption[memberId].quantity += findServing(offerItem.servingPreset, orderItem.variant)?.quantity ?? 0;
        memberConsumption[memberId].spent += offerItem.pricing?.[orderItem.variant] || 0;
    }

    return memberConsumption
}

export type ClosureData = Awaited<ReturnType<typeof collectClosureData>>;

export async function getLastUnseal(
    pb: NonNullable<App.Locals['pb']>,
    bar: Pick<Bar, "slug">,
    offerItemKey: string,
) {
    const list = await pb.collection<BarEventRecord<{ offerItemKey: string; quantity?: number }>>('events')
        .getList(1, 1, {
            filter: `type = "unseal" && target = "bar:${bar.slug}" && data.offerItemKey = "${offerItemKey}"`,
            sort: '-occurredAt',
        });

    const event = list.items[0];
    return {
        date: event ? effectiveDate(event) : null,
        count: list.totalItems > 0 ? list.totalItems : 1,
        quantity: event?.data.quantity ?? 0,
    };
}

export async function getOrderItemsSinceUnseal(
    pb: NonNullable<App.Locals['pb']>,
    bar: Pick<Bar, "slug">,
    offerItemKey: string,
    sinceDate: string | null,
) {
    const clauses = [
        `key = "${offerItemKey}"`,
        `customer.bar.slug = "${bar.slug}"`,
    ];
    if (sinceDate) {
        clauses.push(`orderedAt >= "${toPbDate(sinceDate)}"`);
    }

    return await pb.collection<BarOrderItemRecord>('bar_order_items')
        .getFullList({
            filter: clauses.join(' && '),
            expand: 'customer',
        });
}
