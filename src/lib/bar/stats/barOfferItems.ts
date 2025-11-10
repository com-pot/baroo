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
