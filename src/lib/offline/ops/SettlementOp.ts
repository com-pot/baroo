/** A tab paid off at the bar. */
export type SettlementOp = {
    kind: 'settlement';
    memberId: string;
    memberLabel: string;
    amountDue: number;
    amountPaid: number;
};
