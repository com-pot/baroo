import type { MemberCreateOp } from './ops/MemberCreateOp';
import type { OrderOp } from './ops/OrderOp';
import type { SettlementOp } from './ops/SettlementOp';
import type { TagMappingOp } from './ops/TagMappingOp';
import type { UnsealOp } from './ops/UnsealOp';

export type { MemberCreateOp, OrderOp, SettlementOp, TagMappingOp, UnsealOp };

/** Everything that can happen at a kiosk, as the thing itself. */
export type BarOp = OrderOp | TagMappingOp | SettlementOp | MemberCreateOp | UnsealOp;

export type OpKind = BarOp['kind'];

/** The one op of a given kind, picked out of the union. */
export type OpOf<Kind extends OpKind> = Extract<BarOp, { kind: Kind }>;

/**
 * What the outbox adds around an op. Not part of any op's own shape — the store wraps
 * every op in this on the way in, and the caller never sees it.
 */
export type OpMeta = {
    /** Client-generated UUID. Both the idempotency key and the handle for voiding. */
    clientId: string;
    barSlug: string;
    /** Bumped on each failed push, for backoff and for showing the barman what is stuck. */
    attempts: number;
    error?: string;
    /** When it happened, by the tablet's clock. Stamped at enqueue, never by the server. */
    occurredAt: string;
};

/** An op as the outbox holds it: what happened, plus the bookkeeping around it. */
export type OutboxOp = OpMeta & BarOp;

/** An op as stored, with the auto-increment key that defines apply order. */
export type StoredOp = OutboxOp & { seq: number };

/**
 * A member created on a tablet has no server id yet, so it gets a synthetic one built
 * from its op's `clientId`. These ids never leave the tablet as identities — the sync
 * endpoint treats them as "unknown" and resolves the member by nickname instead.
 */
export const LOCAL_MEMBER_PREFIX = 'local:';

/** A member that exists only in the outbox, pending its first sync. */
export const isLocalMemberId = (id: string | undefined | null): boolean =>
    !!id && id.startsWith(LOCAL_MEMBER_PREFIX);

/** The server id of a member, or `undefined` while they only exist in the outbox. */
export const serverMemberId = (id: string | undefined | null): string | undefined =>
    id && !isLocalMemberId(id) ? id : undefined;
