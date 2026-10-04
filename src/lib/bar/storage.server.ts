import type { Db } from "../db.server";
import type { Bar, BarMember, BarOfferItem } from "./BarModel";
import type { TagMapping } from "./tags";

export async function loadBarData(pb: Db, ref: Bar["slug"], knownBar?: Bar) {
    const bar: Bar = knownBar ?? await pb.collection<Bar>('bars').getFirstListItem(`slug="${ref}"`);
    const [
        offerItems,
        members,
        mappings,
    ] = await Promise.all([
        pb.collection<BarOfferItem>('bar_offer_items').getFullList({
            filter: `bar.slug="${ref}"`,
            sort: 'seq',
        }),
        pb.collection<BarMember>('bar_members').getFullList({
            filter: `bar.slug="${ref}"`,
        }),
        pb.collection('bar_member_mappings').getFullList({
            filter: `member.bar.slug='${ref}'`,
            expand: 'member',
        }),
    ])

    return {
        ref,
        bar,
        offerItems,
        members,
        mappings: toTagMappings(mappings as any[]),
    };
}

function toTagMappings(mappings: { serialId: string, expand?: { member?: any } }[]): TagMapping[] {
    return mappings.map((mapping): TagMapping => ({
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
