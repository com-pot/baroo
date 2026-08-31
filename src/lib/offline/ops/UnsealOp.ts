/** A fresh package of an offer item opened: a keg tapped, a case broken into. */
export type UnsealOp = {
    kind: 'unseal';
    offerItemKey: string;
    offerItemName: string;
    /**
     * What the package holds, in its serving preset's measure — 30 litres of beer, 24
     * bags of crisps — so the overview can say roughly how much of it is left.
     */
    quantity: number;
};
