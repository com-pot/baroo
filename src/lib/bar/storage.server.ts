import type { Db } from "../db.server";
import type { Bar, BarMember, BarOfferItem } from "./BarModel";
import type { TagMapping } from "./tags";

/**
 * Loads everything that identifies a bar and its current setup: the bar record,
 * its offer, its members and their tag mappings.
 *
 * `ref` is the bar slug as it appears in the route. Pass `knownBar` when the caller
 * already has the record — a backstage page gets it from the section layout, and
 * re-fetching it would be a second identical query against the same client.
 */
export async function loadBarData(pb: Db, ref: string, knownBar?: Bar) {
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
        mappings,
    };
}

/** Shapes the raw `bar_member_mappings` records into the mapping the kiosk consumes. */
export function toTagMappings(mappings: { serialId: string, expand?: { member?: any } }[]): TagMapping[] {
    return mappings.map((mapping): TagMapping => ({
        serialId: mapping.serialId,
        userId: String(mapping.expand?.member?.id || ''),
        nickName: mapping.expand?.member?.nickName || '',
        extra: {
            seq: String(mapping.expand?.member?.seq ?? ''),
            greeting: mapping.expand?.member?.greeting,
            avatar_1x1: String(mapping.expand?.member?.avatar_1x1 || ''),
        },
    }))
}
