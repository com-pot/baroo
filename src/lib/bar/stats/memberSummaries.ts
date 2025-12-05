import type { Bar, BarMember, BarOfferItem, BarOrderItem } from "../BarModel";
import { getBarOfferIndex } from "./barOfferItems";

export type MemberSummary = {
    member: BarMember;
    standing: {
        totalOrderItems: number;
        settledOrderItems: number;
        pendingOrderItems: number;
        amountDue: number;
    },
    topRank: number | null;
};

export type MemberTimelineEntry = { date: Date; } & (
    {
        type: 'order';
        data: {
            key: string;
            variant: string;
        };
    }
    | {
        type: 'settlement';
        data: {
            amountDue: number;
            amountPaid: number;
        };
    }
)

export async function getMemberSummaries(
    pb: NonNullable<App.Locals['pb']>,
    bar: Pick<Bar, "slug">,
    optimizations?: {
        barOffer?: Awaited<ReturnType<typeof getBarOfferIndex>>
    },
): Promise<MemberSummary[]> {
    const members = await pb.collection<BarMember>('bar_members')
        .getFullList({
            filter: `bar.slug = "${bar.slug}"`,
            sort: 'seq'
        });

    const summaries: MemberSummary[] = [];

    const barOffer = optimizations?.barOffer || await getBarOfferIndex(pb, bar);
    const settlementEvents = await pb.collection('events')
        .getFullList({
            filter: `type = "member-settled" && target = "bar:${bar.slug}"`,
            sort: '-created'
        })

    // Getting full order item list might be heavy. Consider marking "settled" items
    const barOrderItems = await pb.collection<BarOrderItem & {customer: string}>('bar_order_items')
        .getFullList({
            filter: `customer.bar.slug = "${bar.slug}"`,
        })

    for (const member of members) {
        summaries.push({
            member,
            standing: await getMemberStanding(pb, bar, member, {
                barOffer,
                lastSettlementDate: settlementEvents.find(e => e.data.member === member.id)?.created || null,
                memberOrderItems: barOrderItems.filter(oi => oi.customer === member.id),
            }),
            topRank: null,
        });
    }

    const sorted = summaries
        .toSorted((a, b) => b.standing.totalOrderItems - a.standing.totalOrderItems)
        .slice(0, 3)

    const summariesRanked = summaries.map((s) => {
        const index = sorted.findIndex(sorted => sorted.member.id === s.member.id);
        return ({
            ...s,
            topRank: index >= 0 ? index + 1 : null,
        })
    })

    return summariesRanked;
}

export function computeTotalPrice(
    orderItems: BarOrderItem[],
    barOffer: Record<BarOrderItem["key"], BarOfferItem>,
): number {
    let total = 0;
    for (const order of orderItems) {
        const pricing = barOffer[order.key]?.pricing;
        const price = pricing?.[order.variant];
        if (price) {
            total += price;
        }
    }
    return total
}
export async function getMemberStanding(
    pb: NonNullable<App.Locals['pb']>,
    bar: Pick<Bar, "slug">,
    member: Pick<BarMember, "id">,
    optimizations?: {
        barOffer?: Awaited<ReturnType<typeof getBarOfferIndex>>
        lastSettlementDate?: Date | null,
        memberOrderItems?: BarOrderItem[],
    },
) {
    const barOffer = optimizations?.barOffer || await getBarOfferIndex(pb, bar);

    let lastSettlementDate = optimizations?.lastSettlementDate;
    if (lastSettlementDate === undefined) {
        const settlementEvents = await pb.collection('events')
            .getFullList({
                filter: `type = "member-settled" && target = "bar:${bar.slug}" && data.member = "${member.id}"`,
                sort: '-created'
            })
        const lastSettlement = settlementEvents[0]
        lastSettlementDate = lastSettlement?.created
    }

    const memberOrderItems = optimizations?.memberOrderItems || await pb.collection<BarOrderItem>('bar_order_items')
        .getFullList({
            filter: `customer.id = "${member.id}"`,
        });

    const settledItems = !lastSettlementDate ? []
        : memberOrderItems.filter(oi => oi.created <= lastSettlementDate)

    let settledCount = settledItems.length;
    let pendingCount = memberOrderItems.length - settledCount;

    const pendingOrders = memberOrderItems.filter(oi => !lastSettlementDate || oi.created > lastSettlementDate);

    return {
        totalOrderItems: memberOrderItems.length,
        settledOrderItems: settledCount,
        pendingOrderItems: pendingCount,
        amountDue: computeTotalPrice(pendingOrders, barOffer),
    }
}


export async function getMemberTimeline(
    pb: NonNullable<App.Locals['pb']>,
    bar: Pick<Bar, "slug">,
    memberId: string,
): Promise<MemberTimelineEntry[]> {
    const orderItems = await pb.collection('bar_order_items').getFullList({
        filter: `customer.id = "${memberId}"`,
        sort: '-created'
    });

    const settlementEvents = await pb.collection('events').getFullList({
        filter: `type = "member-settled" && target = "bar:${bar.slug}" && data.member = "${memberId}"`,
        sort: '-created'
    });

    const timeline: MemberTimelineEntry[] = [];

    for (const orderItem of orderItems) {
        timeline.push({
            type: 'order',
            date: orderItem.created,
            data: {
                key: orderItem.key,
                variant: orderItem.variant,
            },
        });
    }

    for (const event of settlementEvents) {
        timeline.push({
            type: 'settlement',
            date: event.created,
            data: {
                ...event.data,
                amountPaid: event.data.amountPaid,
                amountDue: event.data.amountDue,
            },
        });
    }

    timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return timeline;
}
