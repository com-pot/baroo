import { toIsoDate } from "$lib/pocketbase";
import type { Measure } from "$lib/si/measure";
import type { Serving } from "./servings";

export type Bar = {
    id: string;
    slug: string;
    name: string;
    currency: string;
}

export type BarOfferItem = {
    id: string,
    key: string;
    name: string;

    measure: Measure;
    servings: readonly Serving[];

    preview_1x1: string | null;
}

/**
 * A package of an offer item, e.g. a 50 l keg: registered, unsealed - onto a tap or not -
 * and flushed once done with. Its orders refer to it, so what is left of it is what it held
 * less what they drew.
 */
export type BarOfferPackage = {
    id: string;
    offerItem: BarOfferItem["id"];
    /** e.g.: Sud 50 l */
    label: string;
    quantity: number;
    /** NFC tag that unseals the package onto a tap */
    tagSerial: string;
    /** `bar_taps` id while it is on a tap */
    tap: string;
    /** Empty while it is only registered */
    unsealedAt: string;
    flushedAt: string;
}

/** A package as the snapshot carries it, by the item's key and the tap's sequence */
export type OfferPackage = Omit<BarOfferPackage, "offerItem" | "tap"> & {
    offerItemKey: BarOfferItem["key"];
    tap: string | null;
}

export type PackageState = "registered" | "unsealed" | "flushed";

export function packageState(offerPackage: Pick<BarOfferPackage, "unsealedAt" | "flushedAt">): PackageState {
    if (offerPackage.flushedAt) return "flushed";
    return offerPackage.unsealedAt ? "unsealed" : "registered";
}

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
    /** `bar_taps` id of the tap it was poured from */
    tap: string;
    /** The package it drew from */
    package: BarOfferPackage["id"];
    created: string;
}


export function effectiveDate(record: { orderedAt?: string; occurredAt?: string; created?: string }): string {
    return toIsoDate(record.orderedAt || record.occurredAt || record.created);
}
