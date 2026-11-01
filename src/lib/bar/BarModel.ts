import { toIsoDate } from "$lib/pocketbase";
import type { Serving, ServingPreset } from "./servings";

export type Bar = {
    id: string;
    slug: string;
    name: string;
}

export type BarOfferItem = {
    id: string,
    key: string;
    name: string;
    servingPreset: ServingPreset["key"];
    pricing: Record<Serving["key"], number>;
    preview_1x1: string | null;
}

/** A kind of package an offer item comes in, e.g. its 50 l keg */
export type BarOfferPackage = {
    id: string;
    offerItem: BarOfferItem["id"];
    /** e.g.: Sud 50 l */
    label: string;
    quantity: number;
    /** NFC tag that unseals a package of this kind onto a tap */
    tagSerial: string;
}

/** A package as the snapshot carries it */
export type OfferPackage = Omit<BarOfferPackage, "offerItem"> & { offerItemKey: BarOfferItem["key"] }

export type BarMember = {
    id: string;
    nickName: string;
    seq: number;
    avatar_1x1: string | null;
    greeting?: string;
}

export interface MemberBalance {
    id: string;
    items: BarOrderItem[];
}

export interface BarOrderItem {
    key: BarOfferItem["key"];

    variant: Serving["key"];
    orderedAt: string;
    clientId?: string;
}

export type BarOrderItemRecord = BarOrderItem & {
    id: string;
    customer: BarMember["id"];
    created: string;
}


export function effectiveDate(record: { orderedAt?: string; occurredAt?: string; created?: string }): string {
    return toIsoDate(record.orderedAt || record.occurredAt || record.created);
}
