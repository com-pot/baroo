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
    /** NFC tag that switches a spigot station to this item */
    tagSerial?: string;
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
    created: string;
}


export function effectiveDate(record: { orderedAt?: string; occurredAt?: string; created?: string }): string {
    return toIsoDate(record.orderedAt || record.occurredAt || record.created);
}
