import type { ServingPresetKey } from "./servings";

export type Bar = {
    id: string;
    slug: string;
    name: string;
}

export type BarOfferItem = {
    id: string,
    key: string;
    name: string;
    /** Price per serving, keyed by the serving keys of `servingPreset`. */
    pricing: Record<string, number>;
    /** Which set of portions this item is poured in. See `./servings`. */
    servingPreset: ServingPresetKey;
    preview_1x1: string | null; // Path to 1x1 preview image
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
    /**
     * The serving that was poured. Usually a serving key of the item's preset, but rows
     * written before presets existed carry free text — never assume it resolves.
     */
    variant: string;
    /**
     * When the drink was actually poured — set by whoever took the order, not by the
     * database. An order buffered underground at 21:30 and synced at 02:00 still reads
     * 21:30. Everything that reasons about time uses this, never the `created` autodate.
     */
    orderedAt: string;
    /** The offline op that produced this row; the idempotency key for replayed syncs. */
    clientId?: string;
}

/** A `bar_order_items` record as it comes back from PocketBase. */
export type BarOrderItemRecord = BarOrderItem & {
    id: string;
    customer: BarMember["id"];
    created: string;
}

/** An `events` record as it comes back from PocketBase. */
export type BarEventRecord<T extends object = Record<string, any>> = {
    id: string;
    type: string;
    target: string;
    data: T;
    /** When the event actually happened; falls back to `created` for pre-offline rows. */
    occurredAt: string;
    clientId?: string;
    created: string;
}

/**
 * PocketBase serialises dates as `2025-12-05 20:01:39.123Z` — a space, not the `T` of
 * ISO 8601. The kiosk generates real ISO strings offline, so the two formats meet
 * constantly. They must never be compared raw: `' '` sorts before `'T'`, which would
 * make every offline order look older than every server one.
 *
 * Everything crossing into JS goes through `toIsoDate`; everything going back into a
 * PocketBase filter expression goes through `toPbDate`.
 */
export function toIsoDate(value: string | undefined | null): string {
    if (!value) return '';
    return value.includes('T') ? value : value.replace(' ', 'T');
}

/** The inverse of `toIsoDate`, for interpolating into PocketBase filter strings. */
export function toPbDate(value: string): string {
    return value.replace('T', ' ');
}

/** `occurredAt`/`orderedAt` where present, `created` for rows written before the offline work. */
export function effectiveDate(record: { orderedAt?: string; occurredAt?: string; created?: string }): string {
    return toIsoDate(record.orderedAt || record.occurredAt || record.created);
}
