import type { BarOrderItem } from "$lib/bar/BarModel";

export type OrderOp = {
    kind: 'order';
    serialId: string;
    memberId?: string;
    memberLabel: string;
    /** `tap` - poured from it, by its sequence; the server tells which package it drew from */
    items: (Pick<BarOrderItem, "key" | "variant"> & { tap?: string | null })[];
};
