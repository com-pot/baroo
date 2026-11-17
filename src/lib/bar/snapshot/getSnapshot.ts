import { ClientResponseError } from 'pocketbase';
import { loadBarData } from '$lib/bar/storage.server';
import { toIsoDate } from '$lib/pocketbase';
import { effectiveDate, type Bar, type BarOfferPackage, type BarOrderItemRecord, type OfferPackage } from '$lib/bar/BarModel';
import { buildMemberTimeline, type MemberTimelineEntry } from '$lib/bar/stats/memberSummaries';
import type { BarSnapshot } from '$lib/offline/types';
import type { SettlementEvent } from '$lib/offline/ops/SettlementOp';
import { BarTapsCollection, tapRef, type BarTap } from '$lib/taps/barTap';

export default async function getSnapshot(ctx: Pick<App.Locals, "pb">, barSlug: Bar["slug"]): Promise<BarSnapshot> {
    const { pb } = ctx
    const { bar, offerItems, members, mappings } = await loadBarData(ctx, barSlug);

    const [orderItems, settlementsByMember, packages, flushed, taps] = await Promise.all([
        pb.collection<BarOrderItemRecord>('bar_order_items').getFullList({
            filter: `customer.bar.slug = "${barSlug}"`,
        }),
        getSettlements(ctx, barSlug).then((settlements) => groupByMember(settlements)),
        getPackages(ctx, barSlug),
        getFlushedPackages(ctx, barSlug),
        getTaps(ctx, barSlug),
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

    const itemKeys = new Map(offerItems.map((item) => [item.id, item.key]));
    const tapRefs = new Map(taps.map((tap) => [tap.id, tapRef(tap)]));

    const flushedPackages: Record<string, number> = {};
    for (const { offerItem } of flushed) {
        const offerItemKey = itemKeys.get(offerItem);
        if (offerItemKey) flushedPackages[offerItemKey] = (flushedPackages[offerItemKey] ?? 0) + 1;
    }

    const snapshot: BarSnapshot = {
        capturedAt: new Date().toISOString(),
        bar,
        offerItems,
        packages: packages.flatMap(({ offerItem, tap, ...offerPackage }): OfferPackage[] => {
            const offerItemKey = itemKeys.get(offerItem);
            return offerItemKey
                ? [{
                    ...offerPackage,
                    offerItemKey,
                    tap: tapRefs.get(tap) ?? null,
                    unsealedAt: toIsoDate(offerPackage.unsealedAt),
                    flushedAt: toIsoDate(offerPackage.flushedAt),
                }]
                : [];
        }),
        flushedPackages,
        members,
        mappings,
        timelines,
        taps: taps.map(({ sequence, name }) => ({ sequence, name })),
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

async function getPackages(ctx: Pick<App.Locals, "pb">, barSlug: Bar["slug"]) {
    return ctx.pb.collection<BarOfferPackage>('bar_offer_packages').getFullList({
        // Flushed ones are done with, their orders know them
        filter: ctx.pb.filter('offerItem.bar.slug = {:barSlug} && flushedAt = ""', { barSlug }),
        sort: 'quantity',
        fields: 'id,offerItem,label,quantity,tagSerial,tap,unsealedAt,flushedAt',
    })
}

async function getFlushedPackages(ctx: Pick<App.Locals, "pb">, barSlug: Bar["slug"]) {
    return ctx.pb.collection<Pick<BarOfferPackage, 'offerItem'>>('bar_offer_packages').getFullList({
        filter: ctx.pb.filter('offerItem.bar.slug = {:barSlug} && flushedAt != ""', { barSlug }),
        fields: 'offerItem',
    })
}

async function getTaps(ctx: Pick<App.Locals, "pb">, barSlug: Bar["slug"]) {
    return ctx.pb.collection<BarTap>(BarTapsCollection).getFullList({
        filter: ctx.pb.filter('bar.slug = {:barSlug}', { barSlug }),
        sort: 'sequence',
        fields: 'id,sequence,name',
    })
}
