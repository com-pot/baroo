import type { Bar, BarMember, BarOfferItem, BarOrderItem, BarOrderItemRecord, BarEventRecord } from "../BarModel";
import { effectiveDate } from "../BarModel";
import { getBarOfferIndex, type BarOfferIndex } from "./barOfferItems";

export type MemberSummary = {
    member: BarMember;
    standing: MemberStanding;
    topRank: number | null;
};

export type MemberStanding = {
    totalOrderItems: number;
    settledOrderItems: number;
    pendingOrderItems: number;
    amountDue: number;
};

export type MemberTimelineEntry = { date: string; } & (
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

// ---------------------------------------------------------------------------
// Pure cores. No PocketBase, no network — the kiosk runs these against its
// offline snapshot, the server runs them against freshly fetched records.
// ---------------------------------------------------------------------------

export function computeTotalPrice(
    orderItems: Pick<BarOrderItem, "key" | "variant">[],
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

/**
 * A member's standing: how much they've drunk, how much of it is already paid for,
 * and what they owe. Items dated at or before the last settlement count as settled.
 */
export function computeMemberStanding(input: {
    orderItems: Pick<BarOrderItem, "key" | "variant" | "orderedAt">[],
    lastSettlementDate: string | null,
    barOffer: BarOfferIndex,
}): MemberStanding {
    const { orderItems, lastSettlementDate, barOffer } = input;

    const isSettled = (item: { orderedAt: string }) =>
        !!lastSettlementDate && item.orderedAt <= lastSettlementDate;

    const pendingOrders = orderItems.filter(item => !isSettled(item));
    const settledCount = orderItems.length - pendingOrders.length;

    return {
        totalOrderItems: orderItems.length,
        settledOrderItems: settledCount,
        pendingOrderItems: pendingOrders.length,
        amountDue: computeTotalPrice(pendingOrders, barOffer),
    }
}

/** Interleaves a member's orders and settlements into one newest-first timeline. */
export function buildMemberTimeline(input: {
    orderItems: Pick<BarOrderItem, "key" | "variant" | "orderedAt">[],
    settlementEvents: { occurredAt: string, data: { amountDue: number, amountPaid: number } }[],
}): MemberTimelineEntry[] {
    const timeline: MemberTimelineEntry[] = [];

    for (const orderItem of input.orderItems) {
        timeline.push({
            type: 'order',
            date: orderItem.orderedAt,
            data: {
                key: orderItem.key,
                variant: orderItem.variant,
            },
        });
    }

    for (const event of input.settlementEvents) {
        timeline.push({
            type: 'settlement',
            date: event.occurredAt,
            data: {
                amountDue: event.data.amountDue,
                amountPaid: event.data.amountPaid,
            },
        });
    }

    timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return timeline;
}

/** Ranks the top 3 drinkers, leaving everyone else with a null rank. */
export function rankSummaries(summaries: MemberSummary[]): MemberSummary[] {
    const podium = summaries
        .toSorted((a, b) => b.standing.totalOrderItems - a.standing.totalOrderItems)
        .slice(0, 3)

    return summaries.map((s) => {
        const index = podium.findIndex(p => p.member.id === s.member.id);
        return { ...s, topRank: index >= 0 ? index + 1 : null };
    })
}

// ---------------------------------------------------------------------------
// PocketBase-backed fetchers. Thin wrappers that gather records and delegate.
// ---------------------------------------------------------------------------

/** Settlement events for a bar, newest first, indexed by member id. */
export async function getSettlementsByMember(
    pb: NonNullable<App.Locals['pb']>,
    bar: Pick<Bar, "slug">,
): Promise<Record<string, BarEventRecord<{ member: string, amountDue: number, amountPaid: number }>[]>> {
    const events = await pb.collection<BarEventRecord<{ member: string, amountDue: number, amountPaid: number }>>('events')
        .getFullList({
            filter: `type = "member-settled" && target = "bar:${bar.slug}"`,
            sort: '-occurredAt',
        })

    const byMember: Record<string, typeof events> = {};
    for (const event of events) {
        const memberId = event.data.member;
        if (!memberId) continue;
        (byMember[memberId] ||= []).push({ ...event, occurredAt: effectiveDate(event) });
    }

    // Re-sort locally: rows written before `occurredAt` existed fall back to `created`,
    // so PocketBase's own ordering can't be trusted here.
    for (const list of Object.values(byMember)) {
        list.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    }

    return byMember;
}

export async function getMemberSummaries(
    pb: NonNullable<App.Locals['pb']>,
    bar: Pick<Bar, "slug">,
    optimizations?: {
        barOffer?: BarOfferIndex
    },
): Promise<MemberSummary[]> {
    const members = await pb.collection<BarMember>('bar_members')
        .getFullList({
            filter: `bar.slug = "${bar.slug}"`,
            sort: 'seq'
        });

    const barOffer = optimizations?.barOffer || await getBarOfferIndex(pb, bar);
    const settlementsByMember = await getSettlementsByMember(pb, bar);

    // Getting full order item list might be heavy. Consider marking "settled" items
    const barOrderItems = await pb.collection<BarOrderItemRecord>('bar_order_items')
        .getFullList({
            filter: `customer.bar.slug = "${bar.slug}"`,
        })

    const summaries = members.map((member): MemberSummary => ({
        member,
        standing: computeMemberStanding({
            orderItems: barOrderItems
                .filter(oi => oi.customer === member.id)
                .map(oi => ({ ...oi, orderedAt: effectiveDate(oi) })),
            lastSettlementDate: settlementsByMember[member.id]?.[0]?.occurredAt || null,
            barOffer,
        }),
        topRank: null,
    }));

    return rankSummaries(summaries);
}

export async function getMemberStanding(
    pb: NonNullable<App.Locals['pb']>,
    bar: Pick<Bar, "slug">,
    member: Pick<BarMember, "id">,
    optimizations?: {
        barOffer?: BarOfferIndex
        lastSettlementDate?: string | null,
        memberOrderItems?: BarOrderItemRecord[],
    },
): Promise<MemberStanding> {
    const barOffer = optimizations?.barOffer || await getBarOfferIndex(pb, bar);

    let lastSettlementDate = optimizations?.lastSettlementDate;
    if (lastSettlementDate === undefined) {
        const settlementEvents = await pb.collection<BarEventRecord>('events')
            .getFullList({
                filter: `type = "member-settled" && target = "bar:${bar.slug}" && data.member = "${member.id}"`,
                sort: '-occurredAt',
            })
        lastSettlementDate = settlementEvents[0] ? effectiveDate(settlementEvents[0]) : null;
    }

    const memberOrderItems = optimizations?.memberOrderItems || await pb.collection<BarOrderItemRecord>('bar_order_items')
        .getFullList({
            filter: `customer.id = "${member.id}"`,
        });

    return computeMemberStanding({
        orderItems: memberOrderItems.map(oi => ({ ...oi, orderedAt: effectiveDate(oi) })),
        lastSettlementDate,
        barOffer,
    });
}

export async function getMemberTimeline(
    pb: NonNullable<App.Locals['pb']>,
    bar: Pick<Bar, "slug">,
    memberId: string,
): Promise<MemberTimelineEntry[]> {
    const orderItems = await pb.collection<BarOrderItemRecord>('bar_order_items').getFullList({
        filter: `customer.id = "${memberId}"`,
        sort: '-orderedAt',
    });

    const settlementEvents = await pb.collection<BarEventRecord<{ amountDue: number, amountPaid: number }>>('events').getFullList({
        filter: `type = "member-settled" && target = "bar:${bar.slug}" && data.member = "${memberId}"`,
        sort: '-occurredAt',
    });

    return buildMemberTimeline({
        orderItems: orderItems.map(oi => ({ ...oi, orderedAt: effectiveDate(oi) })),
        settlementEvents: settlementEvents.map(e => ({ ...e, occurredAt: effectiveDate(e) })),
    });
}
