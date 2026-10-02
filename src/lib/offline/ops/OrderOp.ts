import type { BarOrderItem } from "$lib/bar/BarModel";

export type OrderOp = {
    kind: 'order';
    serialId: string;
    memberId?: string;
    memberLabel: string;
    items: Pick<BarOrderItem, "key" | "variant">[];
};
