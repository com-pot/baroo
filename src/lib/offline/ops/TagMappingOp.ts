/** A card handed to a member, linking its serial to them. */
export type TagMappingOp = {
    kind: 'tag-mapping';
    serialId: string;
    nickName: string;
    memberId?: string;
};
