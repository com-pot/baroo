
export type UnsealOp = {
    kind: 'unseal';
    offerItemKey: string;
    offerItemName: string;
    /** A registered package, or the id minted for a package the op registers */
    packageId: string;
    /** What a package not registered before holds */
    quantity: number;
    label?: string;
    tap?: string | null;
    /** Only on ops from before packages were registered */
    flushCurrent?: boolean;
};
