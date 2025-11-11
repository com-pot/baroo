import type { Bar, BarOfferItem, BarOrderItem } from "../BarModel";

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
        totalLiters: number,
        totalSpent: number,
    }[] = [];

    for (let member of members) {
        const orderItems = await pb.collection<BarOrderItem>('bar_order_items').getFullList({
            filter: `customer.id = "${member.id}"`,
        });
        
        let totalLiters = 0;
        let totalSpent = 0;

        for (let orderItem of orderItems) {
            const offerItem = offerItemsMap[orderItem.key];
            if (offerItem) {
                // Calculate liters
                const volumeInML = offerItem.variantVolumes?.[orderItem.variant];
                if (volumeInML) {
                    totalLiters += volumeInML / 1000; // Convert ML to liters
                } else {
                    // Fallback to default volumes
                    const defaultVolumes: Record<string, number> = { 'x': 0.3, '1': 0.5 };
                    totalLiters += defaultVolumes[orderItem.variant] || 0.5;
                }

                // Calculate money spent
                const price = offerItem.pricing?.[orderItem.variant] || 0;
                totalSpent += price;
            }
        }

        memberStats.push({
            member,
            orderCount: orderItems.length,
            totalLiters: Math.round(totalLiters * 10) / 10, // Round to 1 decimal
            totalSpent: Math.round(totalSpent),
        });
    }

    // Sort by order count descending
    memberStats.sort((a, b) => b.orderCount - a.orderCount);

    return memberStats;
}
