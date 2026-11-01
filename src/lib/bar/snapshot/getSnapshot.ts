import { loadBarData } from '$lib/bar/storage.server';
import { effectiveDate, type Bar, type BarOrderItemRecord } from '$lib/bar/BarModel';
import { buildMemberTimeline, type MemberTimelineEntry } from '$lib/bar/stats/memberSummaries';
import type { BarSnapshot } from '$lib/offline/types';
import type { UnsealEvent } from '../ops/unseal';
import type { SettlementEvent } from '$lib/offline/ops/SettlementOp';

export default async function getSnapshot(ctx: Pick<App.Locals, "pb">, barSlug: Bar["slug"]): Promise<BarSnapshot> {
    const { pb } = ctx
    const { bar, offerItems, members, mappings } = await loadBarData(ctx, barSlug);

    const [orderItems, settlementsByMember, unseals] = await Promise.all([
        pb.collection<BarOrderItemRecord>('bar_order_items').getFullList({
            filter: `customer.bar.slug = "${barSlug}"`,
        }),
        getSettlements(ctx, barSlug).then((settlements) => groupByMember(settlements)),
        getUnseals(ctx, barSlug),
    ]);

    const ordersByMember = new Map<string, BarOrderItemRecord[]>();
    for (const item of orderItems) {
        const list = ordersByMember.get(item.customer);
        if (list) list.push(item);
        else ordersByMember.set(item.customer, [item]);
    }

    const timelines: Record<string, MemberTimelineEntry[]> = {};

    for (const member of members) {
        const memberSettlements = (settlementsByMember.get(member.id) ?? [])
            .map(e => ({ ...e, occurredAt: effectiveDate(e) }));

        timelines[member.id] = buildMemberTimeline({
            orderItems: (ordersByMember.get(member.id) ?? [])
                .map(oi => ({ ...oi, orderedAt: effectiveDate(oi) })),
            settlementEvents: memberSettlements,
        });
    }

    const snapshot: BarSnapshot = {
        capturedAt: new Date().toISOString(),
        bar,
        offerItems,
        members,
        mappings,
        timelines,
        unseals,
    };

    return snapshot
}

async function getSettlements(ctx: Pick<App.Locals, "pb">, barSlug: Bar["slug"]) {
    return ctx.pb.collection<SettlementEvent>('events').getFullList({
        filter: `type = "member-settled" && target = "bar:${barSlug}"`,
        sort: "created",
    })
}
function groupByMember(settlements: SettlementEvent[]) {
    const settlementsByMember = new Map<string, typeof settlements>();
    for (const settlement of settlements) {
        const memberId = settlement.data.member;
        if (!memberId) continue;
        const list = settlementsByMember.get(memberId);
        if (list) list.push(settlement);
        else settlementsByMember.set(memberId, [settlement]);
    }
    return settlementsByMember
}

async function getUnseals(ctx: Pick<App.Locals, "pb">, barSlug: Bar["slug"]) {
    const unsealEvents = await ctx.pb.collection<UnsealEvent>('events').getFullList({
        filter: `type = "unseal" && target = "bar:${barSlug}"`,
        sort: 'created',
    })

    const unseals: Record<string, UnsealEvent[]> = {};
    for (const unseal of unsealEvents) {
        const key = unseal.data.offerItemKey;
        if (!key) continue;
        if (!unseals[key]) unseals[key] = []

        unseals[key].push(unseal)
    }

    return unseals
}
