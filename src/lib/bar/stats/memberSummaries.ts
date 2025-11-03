import type { Bar } from "../BarModel";

export type MemberSummary = {
    member: {
        id: string;
        nickName: string;
        seq: number;
    };
    totalOrderItems: number;
    settledOrderItems: number;
    pendingOrderItems: number;
    lastSettlement: {
        date: string;
        amountPaid: number;
    } | null;
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
            amountPaid: number;
        };
    }
)

export async function getMemberSummaries(
    pb: NonNullable<App.Locals['pb']>,
    bar: Pick<Bar, "slug">,
): Promise<MemberSummary[]> {
    const members = await pb.collection('bar_members').getFullList({
        filter: `bar.slug = "${bar.slug}"`,
        sort: 'nickName'
    });

    const summaries: MemberSummary[] = [];

    for (const member of members) {
        const settlementEvents = await pb.collection('events').getFullList({
            filter: `type = "member-settled" && target = "bar:${bar.slug}" && data.member = "${member.id}"`,
            sort: '-created'
        });

        const lastSettlement = settlementEvents[0];
        const lastSettlementDate = lastSettlement?.created;

        const totalOrderItems = await pb.collection('bar_order_items').getList(1, 1, {
            filter: `customer.id = "${member.id}"`,
        });

        let settledCount = 0;
        let pendingCount = 0;

        if (lastSettlementDate) {
            const settledItems = await pb.collection('bar_order_items').getList(1, 1, {
                filter: `customer.id = "${member.id}" && created <= "${lastSettlementDate}"`,
            });
            settledCount = settledItems.totalItems;
            pendingCount = totalOrderItems.totalItems - settledCount;
        } else {
            pendingCount = totalOrderItems.totalItems;
        }

        summaries.push({
            member: {
                id: member.id,
                nickName: member.nickName,
                seq: member.seq,
            },
            totalOrderItems: totalOrderItems.totalItems,
            settledOrderItems: settledCount,
            pendingOrderItems: pendingCount,
            lastSettlement: lastSettlement ? {
                date: lastSettlement.created,
                amountPaid: lastSettlement.data.amountPaid,
            } : null,
        });
    }

    return summaries;
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
                amountPaid: event.data.amountPaid,
            },
        });
    }

    timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return timeline;
}
