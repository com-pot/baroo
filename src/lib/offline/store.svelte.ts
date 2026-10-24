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
    writeDeviceConfig,
} from './idb';

import {
    LOCAL_MEMBER_PREFIX,
    type BarOp,
    type OpKind,
    type OutboxOp,
    type StoredOp,
} from './op';
import type { BarSnapshot, DeviceIdentity, SnapshotUnseal } from './types';
import type LineCheck from './lineCheck.svelte';
import { indexBy } from '$lib/lists';

const newId = () =>
    typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export class BarOfflineStore {
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

    // --- lifecycle ----------------------------------------------------------

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

    /** Offer as the kiosk should render it — straight from the snapshot. */
    get offerItems(): BarOfferItem[] {
        return this.snapshot?.offerItems ?? [];
    }

    get barOffer(): BarOfferIndex {
        return indexBy("key", this.offerItems);
    }

    /** Snapshot mappings plus any made offline since. */
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

    /** Snapshot members plus placeholders for members created offline. */
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
            } else if (op.kind === 'tag-mapping' && !op.memberId) {
                // Cards mapped by an older build, which created the member implicitly.
                add(`${LOCAL_MEMBER_PREFIX}${op.clientId}`, op.nickName, 0);
            }
        }

        return members;
    }

    /**
     * The badge number to hand the next member. Offline this is a guess — two tablets
     * enrolling at once will both suggest the same one, and the sync endpoint moves the
     * loser to the next free slot.
     */
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

    findMemberBySeq(seq: number): BarMember | undefined {
        return this.members.find(member => member.seq === seq);
    }

    findMappingByMember(memberId: string): TagMapping | undefined {
        return this.mappings.find(mapping => mapping.member.id === memberId);
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

        const settlements = timeline.filter(entry => entry.type === 'settlement');

        return computeMemberStanding({
            orderItems: timeline
                .filter(entry => entry.type === 'order')
                .map(entry => ({ ...entry.data, orderedAt: entry.date })),
            lastSettlementDate: settlements[0]?.date ?? null,
            barOffer: this.barOffer,
        });
    }

    get summaries(): MemberSummaryEntry[] {
        return this.members.map(member => ({
            member,
            standing: this.standing(member.id),
        }))
    }

    /**
     * Every drink this tablet knows was poured — the snapshot's history and the rounds
     * still in the outbox — flattened out of the per-member timelines it is filed under.
     */
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

    /**
     * What is left in each open package. The barman opens one and pours from it long
     * before either op reaches a server, so the outbox overrides the snapshot on both
     * sides of the sum.
     */
    get stock(): OfferStock[] {
        const unseals: Record<string, SnapshotUnseal> = { ...(this.snapshot?.unseals ?? {}) };

        for (const op of this.pending) {
            if (op.kind !== 'unseal') continue;
            const known = unseals[op.offerItemKey];
            if (known && known.occurredAt >= op.occurredAt) continue;
            unseals[op.offerItemKey] = { occurredAt: op.occurredAt, quantity: op.quantity };
        }

        return computeOfferStock({
            offerItems: this.offerItems,
            unseals,
            orderItems: this.orderItems,
        });
    }

    /** Cards scanned but not mapped to anyone — the staff kiosk's to-do list. */
    unknownTags = $state<string[]>([]);

    noteUnknownTag(serialId: string) {
        if (this.findMapping(serialId)) return;
        if (this.unknownTags.includes(serialId)) return;
        this.unknownTags = [...this.unknownTags, serialId];
    }

    // --- mutations ----------------------------------------------------------

    /**
     * Queues one op of any kind — the single way anything the kiosk does reaches the
     * outbox. The caller says what happened; the bookkeeping around it (`clientId`,
     * `barSlug`, `attempts`) is the store's business.
     */
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

        const stored = await appendOp(full);
        this.pending = [...this.pending, stored];

        // A card that just got a name is no longer one of the staff console's to-dos.
        if (full.kind === 'tag-mapping') {
            this.unknownTags = this.unknownTags.filter(tag => tag !== full.serialId);
        }

        if (full.kind === 'device-config') {
            await this.adoptConfig(full.config, stored.seq);
        }

        this.opts?.onProcessed?.()

        return stored;
    }

    /**
     * Settings hold at the tablet the moment they are saved, not when the server hears
     * about them — the kiosk being configured is the one in front of the barman, and it
     * may not see a server again tonight.
     *
     * Any earlier edit still in the outbox goes with it. Only the newest settings are
     * worth pushing, and an older one retried after this one — which is what happens when
     * the first push fails and the second goes through — would quietly put the tablet
     * back. Dropping it is lossless: the op is the whole config, not a patch.
     */
    private async adoptConfig(config: PosDeviceConfig, keepSeq: number) {
        for (const stale of [...this.pending]) {
            if (stale.kind === 'device-config' && stale.seq !== keepSeq) {
                await this.voidOp(stale.seq);
            }
        }

        this.device = await writeDeviceConfig(config);
    }

    /** Drops a pending op. Only ever legal before it has synced. */
    async voidOp(seq: number) {
        await deleteOp(seq);
        this.pending = this.pending.filter(op => op.seq !== seq);
    }

    // --- sync ---------------------------------------------------------------
}

