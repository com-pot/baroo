import type { Bar } from "../BarModel";

export async function getMemberOrders(
    pb: NonNullable<App.Locals['pb']>,
    bar: Pick<Bar, "slug">,
) {
    const members = await pb.collection('bar_members').getFullList({
        filter: `bar.slug = "${bar.slug}"`,
        sort: 'nickName'
    });

    const memberStats: {
        member: typeof members[0],
        orderCount: number,
    }[] = [];

    for (let member of members) {
        const orderCount = await pb.collection('bar_order_items').getList(1, 1, {
            filter: `customer.id = "${member.id}"`,
        });
        memberStats.push({
            member,
            orderCount: orderCount.totalItems
        });
    }

    // Sort by order count descending
    memberStats.sort((a, b) => b.orderCount - a.orderCount);

    return memberStats;
}
