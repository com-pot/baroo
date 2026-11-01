import type { BarMember, BarOfferItem } from '$lib/bar/BarModel';
import {
    computeOfferStock,
    type BarOfferIndex,
    type OfferStock,
} from '$lib/bar/stats/barOfferItems';
import {
    computeMemberStanding,
    type MemberStanding,
    type MemberSummaryEntry,
    type MemberTimelineEntry,
} from '$lib/bar/stats/memberSummaries';
import type { TagMapping } from '$lib/bar/tags';
import { readPosConfig, type PosDeviceConfig } from '$lib/pos/device';
import {
    appendOp,
    deleteOp,
    listOps,
    readDevice,
    readSnapshot,
    patchDevice,
} from './idb';

import {
    LOCAL_MEMBER_PREFIX,
    type BarOp,
    type OpKind,
    type OutboxOp,
    type StoredOp,
} from './op';
import type { BarSnapshot, DeviceIdentity } from './types';
import type LineCheck from './lineCheck.svelte';
import { indexBy } from '$lib/lists';
import { isMessageRef, messageRef, type MessageRef } from '$lib/i18n';
import { appError, type AppError } from '$lib/errors';

const newId = () =>
    typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;


const preStoreValidation: Partial<{
    [Kind in OpKind]: (store: BarOfflineStore, op: BarOp & {kind: Kind}) => true | MessageRef
}> = {
    'member-create'(store, op) {
        if (!op.nickName || !Number.isInteger(op.memberSeq) || op.memberSeq < 1) {
            return messageRef("baroo.staff.member_invalid", {})
        }

        if (store.members.some((member) => member.nickName === op.nickName)) {
            return messageRef("baroo.staff.member_duplicate", { nickName: op.nickName })
        }

        if (store.members.some((member) => member.seq === op.memberSeq)) {
            return messageRef("baroo.staff.member_seq_taken", { seq: op.memberSeq })
        }

        return true
    },
    'settlement'(store, op) {
        if (isNaN(op.amountPaid) || op.amountPaid < op.amountDue) {
            return messageRef("baroo.staff.settle_short", {});
        }

        return true
    },
}

export class BarOfflineStore {
    /** Forward-compatible single point of truth for currency */
    currency = "czk"
    barSlug = $state('');
    device = $state<DeviceIdentity | null>(null);
    snapshot = $state<BarSnapshot | null>(null);

    pending = $state<StoredOp[]>([]);

    constructor(
        barSlug: string,
        public readonly lineCheck: LineCheck,
        private opts?: {
            onLoad?: () => unknown,
            onProcessed?: () => unknown,
        },
    ) {
        this.barSlug = barSlug;
    }

    async load() {
        this.device = await readDevice();
        this.snapshot = await readSnapshot(this.barSlug);
        this.pending = await listOps(this.barSlug);
        this.opts?.onLoad?.()
    }

    get isEnrolled() {
        return !!this.device;
    }

    get isStaffDevice() {
        return this.device?.device.kind === "staff";
    }

    get config(): PosDeviceConfig {
        return readPosConfig(this.device?.device.config);
    }

    get deviceLabel(): string {
        return this.device?.device.label ?? '';
    }

    get snapshotAge(): number | null {
        if (!this.snapshot) return null;
        return Date.now() - new Date(this.snapshot.capturedAt).getTime();
    }

    // --- derived views ------------------------------------------------------
    get offerItems(): BarOfferItem[] {
        return this.snapshot?.offerItems ?? [];
    }

    get barOffer(): BarOfferIndex {
        return indexBy("key", this.offerItems);
    }

    get mappings(): TagMapping[] {
        const merged = new Map<string, TagMapping>();

        for (const mapping of this.snapshot?.mappings ?? []) {
            merged.set(mapping.serialId, mapping);
        }

        for (const op of this.pending) {
            if (op.kind !== 'tag-mapping') continue;
            merged.set(op.serialId, {
                serialId: op.serialId,
                member: {
                    id: op.memberId || `${LOCAL_MEMBER_PREFIX}${op.clientId}`,
                    nickName: op.nickName,
                    seq: op.seq,
                },
            });
        }

        return [...merged.values()];
    }

    get members(): BarMember[] {
        const members = [...(this.snapshot?.members ?? [])];
        const known = new Set(members.map(member => member.id));

        const add = (id: string, nickName: string, seq: number) => {
            if (known.has(id)) return;
            known.add(id);
            members.push({ id, nickName, seq, avatar_1x1: null });
        };

        for (const op of this.pending) {
            if (op.kind === 'member-create') {
                add(`${LOCAL_MEMBER_PREFIX}${op.clientId}`, op.nickName, op.memberSeq);
            }
        }

        return members;
    }

    get nextMemberSeq(): number {
        return this.members.reduce((max, member) => Math.max(max, member.seq), 0) + 1;
    }

    findMapping(value: string, memberSeqFallback?: boolean): TagMapping | undefined {
        const mapping = this.mappings.find(mapping => mapping.serialId === value);
        if (mapping) return mapping
        if (memberSeqFallback) {
            const seq = Number(value)
            return this.mappings.find((mapping) => mapping.member.seq == seq)
        }
    }

    findMember(memberId: string): BarMember | undefined {
        return this.members.find(member => member.id === memberId);
    }

    private pendingTimeline(memberId: string): MemberTimelineEntry[] {
        const entries: MemberTimelineEntry[] = [];

        for (const op of this.pending) {
            if (op.kind === 'order') {
                const owner = op.memberId || this.findMapping(op.serialId)?.member.id;
                if (owner !== memberId) continue;
                for (const item of op.items) {
                    entries.push({ type: 'order', date: op.occurredAt, data: item });
                }
            } else if (op.kind === 'settlement' && op.memberId === memberId) {
                entries.push({
                    type: 'settlement',
                    date: op.occurredAt,
                    data: { amountDue: op.amountDue, amountPaid: op.amountPaid },
                });
            }
        }

        return entries;
    }

    timeline(memberId: string): MemberTimelineEntry[] {
        const stored = this.snapshot?.timelines[memberId] ?? [];
        const merged = [...stored, ...this.pendingTimeline(memberId)];

        return merged.toSorted(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
        );
    }

    standing(memberId: string): MemberStanding {
        const timeline = this.timeline(memberId);

        const lastSettlement = timeline.find((entry) => entry.type === 'settlement');

        return computeMemberStanding({
            orderItems: timeline
                .filter(entry => entry.type === 'order')
                .map(entry => ({ ...entry.data, orderedAt: entry.date })),
            lastSettlementDate: lastSettlement?.date ?? null,
            barOffer: this.barOffer,
        });
    }

    get summaries(): MemberSummaryEntry[] {
        return this.members.map(member => ({
            member,
            standing: this.standing(member.id),
        }))
    }

    private get orderItems(): { key: string; variant: string; orderedAt: string }[] {
        const items: { key: string; variant: string; orderedAt: string }[] = [];

        for (const timeline of Object.values(this.snapshot?.timelines ?? {})) {
            for (const entry of timeline) {
                if (entry.type !== 'order') continue;
                items.push({ ...entry.data, orderedAt: entry.date });
            }
        }

        for (const op of this.pending) {
            if (op.kind !== 'order') continue;
            for (const item of op.items) {
                items.push({ ...item, orderedAt: op.occurredAt });
            }
        }

        return items;
    }

    private get unseals() {
        const unseals: NonNullable<typeof this.snapshot>["unseals"] = {};
        for (const [name, itemUnseals] of Object.entries(this.snapshot?.unseals || {})) {
            unseals[name] = itemUnseals.slice()
        }

        for (const op of this.pending) {
            if (op.kind !== 'unseal') continue;
            if (!unseals[op.offerItemKey]) unseals[op.offerItemKey] = []
            unseals[op.offerItemKey].push({
                clientId: op.clientId,
                created: op.occurredAt,
                id: op.clientId,
                occurredAt: op.occurredAt,
                target: `bar:${op.barSlug}`,
                type: "unseal",
                data: {
                    offerItemKey: op.offerItemKey,
                    quantity: op.quantity,
                    // If we need the closure data from the offline ops, we're cooked. Sorry
                    closureData: null as any,
                },
            });
        }

        return unseals
    }

    get stock(): OfferStock[] {
        return computeOfferStock({
            offerItems: this.offerItems,
            unseals: this.unseals,
            orderItems: this.orderItems,
        });
    }

    unknownTags = $state<string[]>([]);
    noteUnknownTag(serialId: string) {
        if (this.findMapping(serialId)) return;
        if (this.unknownTags.includes(serialId)) return;
        this.unknownTags = [...this.unknownTags, serialId];
    }

    async process<Kind extends OpKind>(
        kind: Kind,
        data: Omit<BarOp & { kind: Kind }, 'kind'> & { clientId?: string; occurredAt?: string },
    ): Promise<StoredOp> {
        const full = $state.snapshot({
            ...data,
            kind,
            clientId: data.clientId || newId(),
            occurredAt: data.occurredAt || new Date().toISOString(),
            barSlug: this.barSlug,
            attempts: 0,
        }) as OutboxOp;

        const result = preStoreValidation[kind]?.(this, full as OutboxOp & { kind: Kind })
        if (isMessageRef(result)) {
            throw appError('validation-failed', { messageRef: result })
        }

        const stored = await appendOp(full);
        this.pending = [...this.pending, stored];

        if (full.kind === 'tag-mapping') {
            this.unknownTags = this.unknownTags.filter(tag => tag !== full.serialId);
        }

        if (full.kind === 'device-config') {
            await this.adoptConfig(full.config, stored.seq);
        }

        this.opts?.onProcessed?.()

        return stored;
    }

    private async adoptConfig(config: PosDeviceConfig, keepSeq: number) {
        for (const stale of [...this.pending]) {
            if (stale.kind === 'device-config' && stale.seq !== keepSeq) {
                await this.voidOp(stale.seq);
            }
        }

        this.device = await patchDevice({ config });
    }

    async voidOp(seq: number) {
        await deleteOp(seq);
        this.pending = this.pending.filter(op => op.seq !== seq);
    }
}
