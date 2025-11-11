import type { Bar, BarOfferItem, BarOrderItem } from "../BarModel";

export async function getBarOfferItems(
    pb: NonNullable<App.Locals['pb']>,
    bar: Pick<Bar, "slug">,
) {
    const offerItemsRaw = await pb.collection<BarOfferItem>('bar_offer_items')
        .getFullList({
            filter: `bar.slug = "${bar.slug}"`,
            sort: 'name',
        })

    const offerItems: {
        data: typeof offerItemsRaw[0],
        lastKegUncork: Date | null,
        orderItems: BarOrderItem[],
    }[] = []

    for (let offerItem of offerItemsRaw) {
        const kegUncorkList = await pb.collection('events')
            .getList(1, 1, {
                filter: `type = "keg-uncork" && target = "bar:${bar.slug}" && data.offerItemKey = "${offerItem.key}"`,
                sort: '-created'
            })
        const lastUncorkEvent = kegUncorkList.items[0];

        const orderItemFilterClauses = [
            `key = "${offerItem.key}"`,
            `customer.bar.slug = "${bar.slug}"`, // Ensure order items are from this bar
        ]
        if (lastUncorkEvent) {
            orderItemFilterClauses.push(`created >= "${lastUncorkEvent.created}"`)
        }
        const orderItemsList = await pb.collection<BarOrderItem>('bar_order_items')
            .getFullList({
                filter: orderItemFilterClauses.join(' && '),
                expand: 'customer'
            })

        offerItems.push({
            data: offerItem,
            lastKegUncork: lastUncorkEvent?.created || null,
            orderItems: orderItemsList,
        })
    }

    return offerItems
}

export async function getBarOfferIndex(
    pb: NonNullable<App.Locals['pb']>,
    bar: Pick<Bar, "slug">,
): Promise<Record<BarOfferItem["key"], BarOfferItem>> {
    const offerItems = await pb.collection('bar_offer_items').getFullList({
        filter: `bar.slug = "${bar.slug}"`,
    });

    return Object.fromEntries(offerItems.map(item => [item.key, item]));
}

/**
 * Collects statistics for the current keg (since last uncork) for a specific offer item
 * This includes total volume consumed and per-member consumption breakdown
 */
export async function collectKegClosureData(
    pb: NonNullable<App.Locals['pb']>,
    bar: Pick<Bar, "slug">,
    offerItemKey: string,
) {
    // Get the offer item details
    const offerItem = await pb.collection<BarOfferItem>('bar_offer_items')
        .getFirstListItem(`bar.slug = "${bar.slug}" && key = "${offerItemKey}"`);

    // Find the last uncork event
    const kegUncorkList = await pb.collection('events')
        .getList(1, 1, {
            filter: `type = "keg-uncork" && target = "bar:${bar.slug}" && data.offerItemKey = "${offerItemKey}"`,
            sort: '-created'
        });
    const lastUncorkEvent = kegUncorkList.items[0];

    // Get all order items since last uncork
    const orderItemFilterClauses = [
        `key = "${offerItemKey}"`,
        `customer.bar.slug = "${bar.slug}"`,
    ];
    if (lastUncorkEvent) {
        orderItemFilterClauses.push(`created >= "${lastUncorkEvent.created}"`);
    }

    const orderItems = await pb.collection<BarOrderItem>('bar_order_items')
        .getFullList({
            filter: orderItemFilterClauses.join(' && '),
            expand: 'customer'
        });

    // Calculate variant counts
    const variantCounts: Record<string, number> = {};
    for (const orderItem of orderItems) {
        variantCounts[orderItem.variant] = (variantCounts[orderItem.variant] || 0) + 1;
    }

    // Calculate total volume in liters
    let totalLiters = 0;
    for (const [variant, count] of Object.entries(variantCounts)) {
        const volumeInML = offerItem.variantVolumes?.[variant];
        if (volumeInML) {
            totalLiters += (volumeInML / 1000) * count;
        } else {
            // Fallback to default volumes
            const defaultVolumes: Record<string, number> = { 'x': 0.3, '1': 0.5 };
            totalLiters += (defaultVolumes[variant] || 0.5) * count;
        }
    }

    // Calculate per-member consumption
    const memberConsumption: Record<string, {
        memberId: string;
        memberName: string;
        count: number;
        liters: number;
        spent: number;
    }> = {};

    for (const orderItem of orderItems) {
        const customer = (orderItem as any).expand?.customer;
        if (!customer) continue;

        const memberId = customer.id;
        const memberName = customer.nickName || customer.id;

        if (!memberConsumption[memberId]) {
            memberConsumption[memberId] = {
                memberId,
                memberName,
                count: 0,
                liters: 0,
                spent: 0,
            };
        }

        memberConsumption[memberId].count += 1;

        // Calculate liters for this order
        const volumeInML = offerItem.variantVolumes?.[orderItem.variant];
        if (volumeInML) {
            memberConsumption[memberId].liters += volumeInML / 1000;
        } else {
            const defaultVolumes: Record<string, number> = { 'x': 0.3, '1': 0.5 };
            memberConsumption[memberId].liters += defaultVolumes[orderItem.variant] || 0.5;
        }

        // Calculate amount spent
        const price = offerItem.pricing?.[orderItem.variant] || 0;
        memberConsumption[memberId].spent += price;
    }

    // Convert to array and sort by consumption (liters)
    const memberStats = Object.values(memberConsumption)
        .map(member => ({
            ...member,
            liters: Math.round(member.liters * 100) / 100, // Round to 2 decimals
            spent: Math.round(member.spent),
        }))
        .sort((a, b) => b.liters - a.liters);

    return {
        offerItemKey,
        offerItemName: offerItem.name,
        lastUncorkDate: lastUncorkEvent?.created || null,
        variantCounts,
        totalLiters: Math.round(totalLiters * 100) / 100,
        totalOrders: orderItems.length,
        memberStats,
    };
}
