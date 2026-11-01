import type { AppEvent } from "$lib/model/event";

export type SettlementOp = {
    kind: 'settlement';
    memberId: string;
    memberLabel: string;
    amountDue: number;
    amountPaid: number;
};

export type SettlementEvent = AppEvent<{ member: string, amountDue: number, amountPaid: number }>
