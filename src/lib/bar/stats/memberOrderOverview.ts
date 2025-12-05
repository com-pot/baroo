import type { BarOfferItem } from "../BarModel";
import type { BarOfferIndex } from "./barOfferItems";
import type { MemberTimelineEntry } from "./memberSummaries";

export function aggregateMemberOrders(timeline: MemberTimelineEntry[], barOffer: BarOfferIndex) {
    const map: Record<string, {offerItem: BarOfferItem, orders: Record<string, number>}> = {};
    for (const entry of timeline) {
        if (entry.type !== 'order') continue;
        const offerItem = barOffer[entry.data.key];
        if (!offerItem) {
            console.error(`Unknown offer item key in timeline: ${entry.data.key}`);
            continue;
        }
        if (!map[offerItem.key]) {
            map[offerItem.key] = {offerItem, orders: {}};
        }
        if (!map[offerItem.key].orders[entry.data.variant]) {
            map[offerItem.key].orders[entry.data.variant] = 0;
        }
        map[offerItem.key].orders[entry.data.variant]++;
    }

    const sorted = Object.values(map)
        .map((item) => ({
            ...item,
            totalCount: Object.values(item.orders).reduce((a, b) => a + b, 0)
        }))
        .sort((a, b) => a.totalCount - b.totalCount)

    return {
        totalOrders: sorted.reduce((a, b) => a + b.totalCount, 0),
        items: sorted,
    }
}
export type MemberOrderStats = ReturnType<typeof aggregateMemberOrders>;
