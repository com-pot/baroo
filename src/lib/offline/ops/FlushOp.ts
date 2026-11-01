
export type FlushOp = {
    kind: 'flush';
    offerItemKey: string;
    offerItemName: string;
    tap?: string | null;
};
