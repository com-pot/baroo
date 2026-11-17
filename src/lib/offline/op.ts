import type { DeviceConfigOp } from './ops/DeviceConfigOp';
import type { FlushOp } from './ops/FlushOp';
import type { MemberCreateOp } from './ops/MemberCreateOp';
import type { OrderOp } from './ops/OrderOp';
import type { SettlementOp } from './ops/SettlementOp';
import type { TagMappingOp } from './ops/TagMappingOp';
import type { UnsealOp } from './ops/UnsealOp';

export type { DeviceConfigOp, FlushOp, MemberCreateOp, OrderOp, SettlementOp, TagMappingOp, UnsealOp };

export type BarOp =
    | OrderOp
    | TagMappingOp
    | SettlementOp
    | MemberCreateOp
    | UnsealOp
    | FlushOp
    | DeviceConfigOp;

export type OpKind = BarOp['kind'];

export type OpMeta = {
    /** Idempotency key */
    clientId: string;
    barSlug: string;
    attempts: number;
    error?: string;
    occurredAt: string;
};

export type OutboxOp = OpMeta & BarOp;

export type StoredOp = OutboxOp & { seq: number };

export const LOCAL_MEMBER_PREFIX = 'local:';
export const isLocalMemberId = (id: string | undefined | null): boolean =>
    !!id && id.startsWith(LOCAL_MEMBER_PREFIX);
export const serverMemberId = (id: string | undefined | null): string | undefined =>
    id && !isLocalMemberId(id) ? id : undefined;
