
export type SettlementOp = {
    kind: 'settlement';
    memberId: string;
    memberLabel: string;
    amountDue: number;
    amountPaid: number;
};
