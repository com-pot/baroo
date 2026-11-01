
export type UnsealOp = {
    kind: 'unseal';
    offerItemKey: string;
    offerItemName: string;
    quantity: number;
    tap?: string | null;
    packageId?: string | null;
    flushCurrent: boolean;
};
