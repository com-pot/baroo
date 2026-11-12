import type { Db } from '$lib/db.server';
import type { BarMember, BarOfferItem, BarOfferPackage } from '$lib/bar/BarModel';
import type { Measure } from '$lib/si/measure';
import type { StoredImage } from './tapImages.server';

/**
 * What the TapTappers need to know about a bar, asked of PocketBase as the tap
 */

export type Drink = {
    id: string;
    key: string;
    name: string;
    image: StoredImage | null;
    measure: Measure;
    /** What the item is offered in, as the TapTapper's buttons answer them */
    servings: BarOfferItem["servings"];
};

export type Package = Pick<BarOfferPackage, 'id' | 'label' | 'quantity'> & { offerItemKey: string };

export type Cardholder = { memberId: string; nickName: string; image: StoredImage | null };

export async function lookupDrink(pb: Db, barSlug: string, key: string): Promise<Drink | null> {
    const [item] = await pb.collection<BarOfferItem>('bar_offer_items').getFullList({
        filter: pb.filter('bar.slug = {:barSlug} && key = {:key}', { barSlug, key }),
    });

    return item ? drinkOf(item) : null;
}

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
export async function lookupCard(pb: Db, barSlug: string, serialId: string): Promise<Cardholder | null> {
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

    return {
        memberId: member.id,
        nickName: member.nickName,
        image: member.avatar_1x1 ? { collection: 'bar_members', recordId: member.id, filename: member.avatar_1x1 } : null,
    };
}

function drinkOf(item: BarOfferItem): Drink {
    return {
        id: item.id,
        key: item.key,
        name: item.name,
        image: item.preview_1x1
            ? { collection: 'bar_offer_items', recordId: item.id, filename: item.preview_1x1 }
            : null,
        measure: item.measure,
        servings: item.servings,
    };
}
