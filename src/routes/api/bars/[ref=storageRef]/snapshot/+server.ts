import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolveDevice } from '$lib/pos/device.server';
import { readPosConfig } from '$lib/pos/device';
import { loadBarData, toTagMappings } from '$lib/bar/storage.server';
import { effectiveDate, type BarEventRecord, type BarOrderItemRecord } from '$lib/bar/BarModel';
import { buildMemberTimeline, type MemberTimelineEntry } from '$lib/bar/stats/memberSummaries';
import type { BarSnapshot } from '$lib/offline/types';

/**
 * Everything a tablet needs to run this bar with no network.
 *
 * Two list queries cover the whole bar — orders and events — and the per-member
 * timelines are assembled in memory. Doing it per member would be an N+1 over a
 * connection we already know is precious.
 */
export const GET: RequestHandler = async (event) => {
    const barSlug = event.params.ref;
    const { pb, token, device } = await resolveDevice(event, barSlug);

    const { bar, offerItems, members, mappings } = await loadBarData(pb, barSlug);

    const [orderItems, events] = await Promise.all([
        pb.collection<BarOrderItemRecord>('bar_order_items').getFullList({
            filter: `customer.bar.slug = "${barSlug}"`,
        }),
        pb.collection<BarEventRecord<{ member?: string; amountDue: number; amountPaid: number }>>('events').getFullList({
            filter: `type = "member-settled" && target = "bar:${barSlug}"`,
        }),
    ]);

    const ordersByMember = new Map<string, BarOrderItemRecord[]>();
    for (const item of orderItems) {
        const list = ordersByMember.get(item.customer);
        if (list) list.push(item);
        else ordersByMember.set(item.customer, [item]);
    }

    const settlementsByMember = new Map<string, typeof events>();
    for (const settlement of events) {
        const memberId = settlement.data.member;
        if (!memberId) continue;
        const list = settlementsByMember.get(memberId);
        if (list) list.push(settlement);
        else settlementsByMember.set(memberId, [settlement]);
    }

    const timelines: Record<string, MemberTimelineEntry[]> = {};
    const lastSettlements: Record<string, string> = {};

    for (const member of members) {
        const memberSettlements = (settlementsByMember.get(member.id) ?? [])
            .map(e => ({ ...e, occurredAt: effectiveDate(e) }));

        timelines[member.id] = buildMemberTimeline({
            orderItems: (ordersByMember.get(member.id) ?? [])
                .map(oi => ({ ...oi, orderedAt: effectiveDate(oi) })),
            settlementEvents: memberSettlements,
        });

        const latest = memberSettlements
            .map(s => s.occurredAt)
            .sort()
            .at(-1);
        if (latest) lastSettlements[member.id] = latest;
    }

    const snapshot: BarSnapshot = {
        capturedAt: new Date().toISOString(),
        bar,
        offerItems,
        members,
        mappings: toTagMappings(mappings as any),
        timelines,
        lastSettlements,
    };

    // The tablet stores this next to its token, so the kiosk can read it offline.
    return json({ snapshot, token, config: readPosConfig(device.config) });
};
