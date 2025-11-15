import type { Bar, BarOfferItem, BarOrderItem } from "../BarModel";
import { computeTotalPrice } from "./memberSummaries";

export async function getMemberOrders(
    pb: NonNullable<App.Locals['pb']>,
    bar: Pick<Bar, "slug">,
) {
    const members = await pb.collection('bar_members').getFullList({
        filter: `bar.slug = "${bar.slug}"`,
        sort: 'nickName'
    });

    // Get all offer items for this bar to calculate prices and volumes
    const offerItems = await pb.collection<BarOfferItem>('bar_offer_items').getFullList({
        filter: `bar.slug = "${bar.slug}"`,
    });
    const offerItemsMap = Object.fromEntries(offerItems.map(item => [item.key, item]));

    const memberStats: {
        member: typeof members[0],
        orderCount: number,
    }[] = [];

    const barOrderItems = await pb.collection<BarOrderItem & Record<string, unknown>>('bar_order_items')
        .getFullList({
            filter: `customer.bar.slug = "${bar.slug}"`,
        })

    console.log('first order item', barOrderItems[0])

    for (let member of members) {
        const customerOrderItems = barOrderItems.filter(oi => oi.customer?.id === member.id);

        memberStats.push({
            member,
            orderCount: customerOrderItems.length,
        });
    }

    // Sort by order count descending
    memberStats.sort((a, b) => b.orderCount - a.orderCount);

    return memberStats;
}
