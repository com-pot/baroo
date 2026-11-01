import { ClientResponseError } from 'pocketbase';
import { loadBarData } from '$lib/bar/storage.server';
import { effectiveDate, type Bar, type BarOfferPackage, type BarOrderItemRecord, type OfferPackage } from '$lib/bar/BarModel';
import { buildMemberTimeline, type MemberTimelineEntry } from '$lib/bar/stats/memberSummaries';
import type { BarSnapshot } from '$lib/offline/types';
import type { UnsealEvent } from '../ops/unseal';
import type { FlushEvent } from '../ops/flush';
import type { SettlementEvent } from '$lib/offline/ops/SettlementOp';

export default async function getSnapshot(ctx: Pick<App.Locals, "pb">, barSlug: Bar["slug"]): Promise<BarSnapshot> {
    const { pb } = ctx
    const { bar, offerItems, members, mappings } = await loadBarData(ctx, barSlug);

    const [orderItems, settlementsByMember, unseals, flushes, packages] = await Promise.all([
        pb.collection<BarOrderItemRecord>('bar_order_items').getFullList({
            filter: `customer.bar.slug = "${barSlug}"`,
        }),
        getSettlements(ctx, barSlug).then((settlements) => groupByMember(settlements)),
        getStockEvents<UnsealEvent>(ctx, barSlug, 'unseal'),
        getStockEvents<FlushEvent>(ctx, barSlug, 'flush'),
        getPackages(ctx, barSlug),
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

    const snapshot: BarSnapshot = {
        capturedAt: new Date().toISOString(),
        bar,
        offerItems,
        packages: packages.flatMap(({ offerItem, ...offerPackage }): OfferPackage[] => {
            const offerItemKey = itemKeys.get(offerItem);
            return offerItemKey ? [{ ...offerPackage, offerItemKey }] : [];
        }),
        members,
        mappings,
        timelines,
        unseals,
        flushes,
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

/** Unseals or flushes per offer item, oldest first */
async function getStockEvents<E extends UnsealEvent | FlushEvent>(ctx: Pick<App.Locals, "pb">, barSlug: Bar["slug"], type: E["type"]) {
    const stockEvents = await ctx.pb.collection<E>('events').getFullList({
        filter: `type = "${type}" && target = "bar:${barSlug}"`,
        sort: 'occurredAt,created',
    })

    const byItem: Record<string, E[]> = {};
    for (const event of stockEvents) {
        const key = event.data.offerItemKey;
        if (!key) continue;
        if (!byItem[key]) byItem[key] = []

        byItem[key].push(event)
    }

    return byItem
}

async function getPackages(ctx: Pick<App.Locals, "pb">, barSlug: Bar["slug"]) {
    return ctx.pb.collection<BarOfferPackage>('bar_offer_packages').getFullList({
        filter: `offerItem.bar.slug = "${barSlug}"`,
        sort: 'quantity',
        fields: 'id,offerItem,label,quantity,tagSerial',
    }).catch((err: unknown) => {
        // Until pb_schema.json is imported, kiosks must keep pulling
        if (err instanceof ClientResponseError && err.status === 404) return [];
        throw err;
    })
}
