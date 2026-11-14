
export type FlushOp = {
    kind: 'flush';
    /** Missing on ops from before packages were registered, those flushed the item */
    packageId?: string;
    offerItemKey: string;
    offerItemName: string;
    tap?: string | null;
};
