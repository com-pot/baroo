/** A round put on someone's tab. */
export type OrderOp = {
    kind: 'order';
    /**
     * The NFC card, not a member id — resolved server-side at sync time. Empty when the
     * order was keyed in by member seq and that member has no card yet.
     */
    serialId: string;
    /** Who ordered, when the kiosk knew. May be a `local:` id, or absent for card entry. */
    memberId?: string;
    /** Denormalised for the staff UI, which has to show pending ops with no lookup. */
    memberLabel: string;
    items: { key: string; variant: string }[];
};
