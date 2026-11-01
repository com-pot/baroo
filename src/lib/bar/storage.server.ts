import type { Bar, BarMember, BarOfferItem } from "./BarModel";
import type { TagMapping } from "./tags";

export async function loadBarData(ctx: Pick<App.Locals, "pb">, ref: Bar["slug"], knownBar?: Bar) {
    const bar: Bar = knownBar ?? await ctx.pb.collection<Bar>('bars').getFirstListItem(`slug="${ref}"`);

    const [
        offerItems,
        members,
        mappings,
    ] = await Promise.all([
        ctx.pb.collection<BarOfferItem>('bar_offer_items').getFullList({
            filter: `bar.slug="${ref}"`,
            sort: 'seq',
        }),
        ctx.pb.collection<BarMember>('bar_members').getFullList({
            filter: `bar.slug="${ref}"`,
        }),
        loadBarTagMappings(ctx, ref),
    ])

    return {
        ref,
        bar,
        offerItems,
        members,
        mappings,
    };
}

export async function loadBarTagMappings(ctx: Pick<App.Locals, "pb">, ref: Bar["slug"]) {
    const items = await ctx.pb.collection('bar_member_mappings').getFullList({
        filter: `member.bar.slug='${ref}'`,
        expand: 'member',
        sort: 'member.seq',
    })

    return items.map((mapping): TagMapping => ({
        serialId: mapping.serialId,
        member: {
            id: String(mapping.expand?.member?.id || ''),
            nickName: mapping.expand?.member?.nickName || '',
            seq: mapping.expand?.member?.seq || 0,
        },
        extra: {
            seq: String(mapping.expand?.member?.seq ?? ''),
            greeting: mapping.expand?.member?.greeting,
            avatar_1x1: String(mapping.expand?.member?.avatar_1x1 || ''),
        },
    }))
}
