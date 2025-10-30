import type { Db } from "../db.server";
import type { Bar, BarMember, BarOfferItem } from "./BarModel";

export function parseStorageRef(ref: string): StorageRef {
    if (ref.startsWith('local:')) {
        return { type: 'local', key: ref.slice('local:'.length) };
    }

    return { type: 'db', key: ref };
}

export async function loadBarData(pb: Db, ref: string|StorageRef) {
    if (typeof ref === 'string') ref = parseStorageRef(ref);

    if (ref.type === 'local') {
        return {ref};
    }

    const bar = await pb.collection<Bar>('bars').getFirstListItem(`slug="${ref.key}"`);
    const [
        offerItems,
        members,
        mappings,
    ] = await Promise.all([
        pb.collection<BarOfferItem>('bar_offer_items').getFullList({
            filter: `bar.slug="${ref.key}"`,
        }),
        pb.collection<BarMember>('bar_members').getFullList({
            filter: `bar.slug="${ref.key}"`,
        }),
        pb.collection('bar_member_mappings').getFullList({
            filter: `member.bar.slug='${ref.key}'`,
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

export type StorageRef = { type: 'local', key: string } | { type: 'db', key: string };

