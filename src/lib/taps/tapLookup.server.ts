import type { Db } from '$lib/db.server';
import type { BarMember, BarOfferItem, BarOfferPackage } from '$lib/bar/BarModel';
import type { PbImageRef } from '$lib/pocketbase';

export type Package = Pick<BarOfferPackage, 'id' | 'label' | 'quantity'> & { offerItemKey: string };

/** By a normalized serial, of a package not flushed - a tag may move onto a new one */
export async function lookupPackageTag(pb: Db, barSlug: string, serialId: string): Promise<Package | null> {
    const [found] = await pb.collection<BarOfferPackage & { expand?: { offerItem?: BarOfferItem } }>('bar_offer_packages').getFullList({
        filter: pb.filter('offerItem.bar.slug = {:barSlug} && tagSerial = {:serialId} && flushedAt = ""', { barSlug, serialId }),
        sort: '-created',
        expand: 'offerItem',
    });

    const offerItemKey = found?.expand?.offerItem?.key;
    return found && offerItemKey
        ? { id: found.id, label: found.label, quantity: found.quantity, offerItemKey }
        : null;
}

/** By a normalized serial, the mapping may have it with colons or in upper case */
export async function lookupCard(pb: Db, barSlug: string, serialId: string): Promise<BarMember | null> {
    const [mapping] = await pb.collection<{ member: string; expand?: { member?: BarMember } }>('bar_member_mappings').getFullList({
        filter: pb.filter('member.bar.slug = {:barSlug} && (serialId:lower = {:plain} || serialId:lower = {:colons})', {
            barSlug,
            plain: serialId,
            colons: serialId.match(/.{1,2}/g)?.join(':') ?? serialId,
        }),
        expand: 'member',
    });

    const member = mapping?.expand?.member;
    if (!member) return null;

    return member ?? null
}

export function barMemberImage(member?: BarMember | null): PbImageRef | null {
    if (!member?.avatar_1x1) return null
    return { collection: 'bar_members', recordId: member.id, filename: member.avatar_1x1 }
}

export function offerItemImageRef(item?: BarOfferItem | null): PbImageRef | null {
    if (!item?.preview_1x1) return null
    return { collection: 'bar_offer_items', recordId: item.id, filename: item.preview_1x1 }
}
