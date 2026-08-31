/** A member enrolled on the tablet, before — or without — any card being mapped to them. */
export type MemberCreateOp = {
    kind: 'member-create';
    nickName: string;
    /**
     * The number printed on the badge. Chosen by the barman, not by the database. Not
     * called `seq` because `StoredOp` claims that name for the outbox's own ordering key.
     */
    memberSeq: number;
};
