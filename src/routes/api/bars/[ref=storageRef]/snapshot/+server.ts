import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolveDevice } from '$lib/pos/device.server';
import { readPosConfig } from '$lib/pos/device';
import { loadBarData } from '$lib/bar/storage.server';
import { effectiveDate, type BarEventRecord, type BarOrderItemRecord } from '$lib/bar/BarModel';
import { buildMemberTimeline, type MemberTimelineEntry } from '$lib/bar/stats/memberSummaries';
import type { BarSnapshot, SnapshotUnseal } from '$lib/offline/types';

export const GET: RequestHandler = async (event) => {
    const barSlug = event.params.ref;
    const { pb, token, device } = await resolveDevice(event, barSlug);

    const { bar, offerItems, members, mappings } = await loadBarData(pb, barSlug);

    const [orderItems, events, unsealEvents] = await Promise.all([
        pb.collection<BarOrderItemRecord>('bar_order_items').getFullList({
            filter: `customer.bar.slug = "${barSlug}"`,
        }),
        pb.collection<BarEventRecord<{ member?: string; amountDue: number; amountPaid: number }>>('events').getFullList({
            filter: `type = "member-settled" && target = "bar:${barSlug}"`,
        }),
        pb.collection<BarEventRecord<{ offerItemKey?: string; quantity?: number }>>('events').getFullList({
            filter: `type = "unseal" && target = "bar:${barSlug}"`,
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

    const unseals: Record<string, SnapshotUnseal> = {};
    for (const unseal of unsealEvents) {
        const key = unseal.data.offerItemKey;
        if (!key) continue;

        const occurredAt = effectiveDate(unseal);
        if (unseals[key] && unseals[key].occurredAt >= occurredAt) continue;

        unseals[key] = { occurredAt, quantity: unseal.data.quantity ?? 0 };
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

    return json({
        snapshot,
        token,
        config: readPosConfig(device.config),
    });
};
