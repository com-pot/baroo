import type { AppEvent } from "$lib/model/event";
import { toPbDate } from "$lib/pocketbase";
import { type Bar, type BarOfferItem, type BarOrderItem, type BarOrderItemRecord } from "../BarModel";
import { findServing, servingPreset } from "../servings";

type UnsealData = Pick<UnsealEvent["data"], "offerItemKey" | "quantity">

export async function barDoUnseal(ctx: Pick<App.Locals, "pb">, slug: Bar["slug"], data: UnsealData) {
    const closureData = await collectClosureData(ctx.pb, { slug }, data.offerItemKey);

    await ctx.pb.collection('events')
        .create({
            type: 'unseal',
            target: `bar:${slug}`,
            occurredAt: new Date().toISOString(),
            data: {
                ...data,
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
    const orderItems = await getOrderItemsSince(pb, bar, offerItemKey, unseal?.occurredAt);

    const variantCounts: Record<string, number> = {};
    for (const orderItem of orderItems) {
        variantCounts[orderItem.variant] = (variantCounts[orderItem.variant] || 0) + 1;
    }

    let totalQuantity = 0;
    for (const [variant, count] of Object.entries(variantCounts)) {
        totalQuantity += findServing(offerItem.servingPreset, variant)?.quantity ?? 0 * count;
    }

    const memberConsumption = calculateMemberConsumption(offerItem, orderItems)

    const memberStats = Object.values(memberConsumption)
        .map(member => ({
            ...member,
            quantity: Math.round(member.quantity * 100) / 100,
        }))
        .sort((a, b) => b.quantity - a.quantity);

    return {
        offerItemKey,
        offerItemName: offerItem.name,
        unsealedAt: unseal?.occurredAt ?? null,
        quantity: unseal?.quantity ?? null,
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
            };
        }

        memberConsumption[memberId].count += 1;
        memberConsumption[memberId].quantity += findServing(offerItem.servingPreset, orderItem.variant)?.quantity ?? 0;
    }

    return memberConsumption
}

export type ClosureData = Awaited<ReturnType<typeof collectClosureData>>;

async function getLastUnseal(
    pb: NonNullable<App.Locals['pb']>,
    bar: Pick<Bar, "slug">,
    offerItemKey: string,
): Promise<UnsealEvent | null> {
    const list = await pb.collection<UnsealEvent>('events')
        .getList(1, 1, {
            filter: `type = "unseal" && target = "bar:${bar.slug}" && data.offerItemKey = "${offerItemKey}"`,
            sort: '-occurredAt',
        });

    return list.items[0] ?? null;
}

export async function getOrderItemsSince(
    pb: NonNullable<App.Locals['pb']>,
    bar: Pick<Bar, "slug">,
    offerItemKey: string,
    sinceDate: string | null | undefined,
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
