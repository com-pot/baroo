import { on } from 'svelte/events';
import type { BarMember, BarOfferItem } from '$lib/bar/BarModel';
import {
    computeOfferStock,
    indexBarOffer,
    type BarOfferIndex,
    type OfferStock,
} from '$lib/bar/stats/barOfferItems';
import {
    buildMemberTimeline,
    computeMemberStanding,
    rankSummaries,
    type MemberStanding,
    type MemberSummary,
    type MemberTimelineEntry,
} from '$lib/bar/stats/memberSummaries';
import type { TagMapping } from '$lib/bar/tags';
import { readPosConfig, type PosDeviceConfig } from '$lib/pos/device';
import {
    appendOp,
    deleteOp,
    listOps,
    readDevice,
    readLastSyncAt,
    readSnapshot,
} from './idb';
import {
    HEARTBEAT_INTERVAL_MS,
    HEARTBEAT_OFFLINE_INTERVAL_MS,
    probeHeartbeat,
} from './heartbeat';
import { NotEnrolledError, pullSnapshot, pushOutbox, type SyncOpResult } from './sync';
import {
    LOCAL_MEMBER_PREFIX,
    type BarOp,
    type OpKind,
    type OutboxOp,
    type StoredOp,
} from './op';
import type { BarSnapshot, DeviceIdentity, SnapshotUnseal } from './types';

const newId = () =>
    typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

/**
 * The kiosk's view of a bar while it has no network.
 *
 * The snapshot is the last thing the server told us; the outbox is everything that has
 * happened since. Nothing here reads the snapshot alone — every view overlays the
 * pending ops on top, so a barman looking at a tab mid-evening sees the rounds that
 * haven't synced yet.
 */
export class OfflineBar {
    barSlug = $state('');
    device = $state<DeviceIdentity | null>(null);
    snapshot = $state<BarSnapshot | null>(null);
    pending = $state<StoredOp[]>([]);
    lastSyncAt = $state<string | null>(null);
    /**
     * Whether the server answered the last heartbeat — see `heartbeat.ts`. Optimistic
     * until the first probe comes back, which takes a moment after the kiosk boots.
     */
    online = $state(true);
    /** When the server last answered, for the staff console. */
    lastHeartbeatAt = $state<string | null>(null);
    /** Why the last heartbeat did not answer. A machine string, null while online. */
    heartbeatError = $state<string | null>(null);
    syncing = $state<null | 'push' | 'pull'>(null);
    lastSyncResults = $state<SyncOpResult[] | null>(null);
    lastError = $state<string | null>(null);

    constructor(barSlug: string) {
        this.barSlug = barSlug;
    }

    // --- lifecycle ----------------------------------------------------------

    async load() {
        this.device = await readDevice();
        this.snapshot = await readSnapshot(this.barSlug);
        this.pending = await listOps(this.barSlug);
        this.lastSyncAt = await readLastSyncAt();
    }

    /**
     * Starts polling the heartbeat endpoint. Returns the teardown.
     *
     * The browser's own online/offline events are kept, but only as prompts to ask the
     * server again — they are the fastest hint that something changed and the least
     * trustworthy answer about whether the server is there. Losing the link is the one
     * case they settle on their own: no link, no server, no reason to spend a probe.
     */
    watchConnectivity(opts?: ConnectivityWatchOptions): () => void {
        const interval = opts?.intervalMs ?? HEARTBEAT_INTERVAL_MS;
        const offlineInterval = opts?.offlineIntervalMs ?? HEARTBEAT_OFFLINE_INTERVAL_MS;

        this.onConnectivityChange = opts?.onChange;

        let stopped = false;
        let timer: ReturnType<typeof setTimeout> | undefined;

        const beat = async () => {
            if (stopped) return;
            await this.checkConnectivity();
            if (stopped) return;
            timer = setTimeout(beat, this.online ? interval : offlineInterval);
        };

        /** Ask now, and restart the clock from the answer. */
        const beatNow = () => {
            clearTimeout(timer);
            void beat();
        };

        const unregisters = [
            on(window, 'offline', () => this.setOnline(false, 'no-link')),
            on(window, 'online', beatNow),
            // A tablet that was asleep, or whose kiosk tab was in the background, has
            // been running on a stale verdict; the barman picking it up wants the truth.
            on(document, 'visibilitychange', () => {
                if (!document.hidden) beatNow();
            }),
        ];

        void beat();

        return () => {
            stopped = true;
            clearTimeout(timer);
            this.onConnectivityChange = undefined;
            unregisters.forEach(unregister => unregister());
        };
    }

    private onConnectivityChange: ConnectivityWatchOptions['onChange'];
    private probing: Promise<boolean> | null = null;
    private connectivityKnown = false;

    /**
     * One heartbeat, now, and the connectivity it found.
     *
     * Concurrent callers — the poll, a reconnect hint, a sync that just failed — share
     * one in-flight probe rather than piling requests onto a server that may already be
     * struggling to answer.
     */
    checkConnectivity(): Promise<boolean> {
        return (this.probing ??= this.runProbe());
    }

    private async runProbe(): Promise<boolean> {
        try {
            const beat = await probeHeartbeat();

            if (beat.ok) this.lastHeartbeatAt = beat.at;
            this.setOnline(beat.ok, beat.ok ? null : beat.reason);

            return beat.ok;
        } finally {
            this.probing = null;
        }
    }

    /**
     * Records the verdict, notifying the watcher only when it is news — the poll runs
     * whether or not anything changed, and a reconnect handler must not fire every
     * thirty seconds for as long as the tablet stays online. The first verdict always
     * counts as news, so a kiosk that boots connected still syncs on startup.
     */
    private setOnline(online: boolean, reason: string | null) {
        const changed = this.online !== online || !this.connectivityKnown;

        this.online = online;
        this.heartbeatError = reason;
        this.connectivityKnown = true;

        if (changed) this.onConnectivityChange?.(online);
    }

    get isEnrolled() {
        return !!this.device;
    }

    get isStaffDevice() {
        return this.device?.kind === 'staff';
    }

    /** Kiosk settings for this tablet. Always complete, even before the first pull. */
    get config(): PosDeviceConfig {
        return readPosConfig(this.device?.config);
    }

    /** What this tablet calls itself, for the kiosk header. */
    get deviceLabel(): string {
        return this.device?.label ?? '';
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
        return indexBarOffer(this.offerItems);
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
                userId: op.memberId || `${LOCAL_MEMBER_PREFIX}${op.clientId}`,
                nickName: op.nickName,
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

    findMapping(serialId: string): TagMapping | undefined {
        return this.mappings.find(mapping => mapping.serialId === serialId);
    }

    findMember(memberId: string): BarMember | undefined {
        return this.members.find(member => member.id === memberId);
    }

    /** Manual kiosk entry: the number printed on the badge, not the card serial. */
    findMemberBySeq(seq: number): BarMember | undefined {
        return this.members.find(member => member.seq === seq);
    }

    /** The card mapped to a member, if they have one. */
    findMappingByMember(memberId: string): TagMapping | undefined {
        return this.mappings.find(mapping => mapping.userId === memberId);
    }

    /** Orders sitting in the outbox for one member, as timeline entries. */
    private pendingTimeline(memberId: string): MemberTimelineEntry[] {
        const entries: MemberTimelineEntry[] = [];

        for (const op of this.pending) {
            if (op.kind === 'order') {
                const owner = op.memberId || this.findMapping(op.serialId)?.userId;
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

    /** Full history for a member: what the server knows plus what is still buffered. */
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

    get summaries(): MemberSummary[] {
        return rankSummaries(
            this.members.map(member => ({
                member,
                standing: this.standing(member.id),
                topRank: null,
            })),
        );
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

        // The outbox is a buffer for having no network, not a to-do list — with signal
        // an op belongs on the server immediately. Deliberately not awaited: the barman
        // gets their dialog back at IndexedDB speed, not at the network's.
        this.requestSync();

        return stored;
    }

    /** Drops a pending op. Only ever legal before it has synced. */
    async voidOp(seq: number) {
        await deleteOp(seq);
        this.pending = this.pending.filter(op => op.seq !== seq);
    }

    // --- sync ---------------------------------------------------------------

    /**
     * Drains the outbox, then refreshes the snapshot if the server took anything.
     *
     * The refresh is not optional. An applied op is deleted from the outbox, so the
     * snapshot becomes the only place its round exists — skip the pull and the drinks
     * disappear off the member's tab until someone happens to pull by hand.
     */
    async push() {
        return this.runSync('push', async () => {
            const results = await this.pushCore();

            if (results.some(result => result.status === 'applied')) {
                this.syncing = 'pull';
                await this.pullCore();
            }
        });
    }

    async pull() {
        return this.runSync('pull', () => this.pullCore());
    }

    /** Push then pull, whether or not the push had anything to send. */
    async sync() {
        return this.runSync('push', async () => {
            await this.pushCore();
            this.syncing = 'pull';
            await this.pullCore();
        });
    }

    private async pushCore(): Promise<SyncOpResult[]> {
        const results = await pushOutbox(this.barSlug);

        // An empty push is the auto-sync finding nothing to do; leaving the last real
        // tally in place keeps the staff console's result line meaningful.
        if (results.length) this.lastSyncResults = results;

        this.pending = await listOps(this.barSlug);
        this.lastSyncAt = await readLastSyncAt();

        return results;
    }

    private async pullCore(): Promise<void> {
        this.snapshot = await pullSnapshot(this.barSlug);
    }

    /**
     * Asks for a background drain — after an op, or on finding ourselves online.
     *
     * Never awaited by callers, and never more than one sync in flight: a request that
     * arrives mid-sync is remembered and runs straight after, so an order placed while
     * the previous one is still uploading isn't left sitting in the buffer.
     */
    requestSync(mode: 'push' | 'sync' = 'push'): void {
        if (!this.isEnrolled || !this.online) return;

        // A reconnect wants the snapshot too, so it wins over a plain push.
        this.queuedSync = this.queuedSync === 'sync' ? 'sync' : mode;

        if (this.syncing) return;
        void this.drain();
    }

    private queuedSync: 'push' | 'sync' | null = null;
    private draining = false;

    private async drain(): Promise<void> {
        if (this.draining) return;
        this.draining = true;

        try {
            await this.drainLoop();
        } finally {
            this.draining = false;
        }
    }

    private async drainLoop(): Promise<void> {
        while (this.queuedSync && this.online) {
            const mode = this.queuedSync;
            this.queuedSync = null;

            // The in-flight push may already have carried the op that queued this one.
            if (mode === 'push' && !this.pending.length) continue;

            // A failed sync leaves the outbox alone. Retrying here would only spin
            // against a server that just said no — the next op, or the next time we
            // come online, tries again.
            if (!(mode === 'sync' ? await this.sync() : await this.push())) return;
        }
    }

    private async runSync(mode: 'push' | 'pull', work: () => Promise<void>): Promise<boolean> {
        if (this.syncing) return false;

        this.syncing = mode;
        this.lastError = null;
        try {
            await work();
            return true;
        } catch (err) {
            this.lastError =
                err instanceof NotEnrolledError
                    ? 'not-enrolled'
                    : err instanceof Error
                      ? err.message
                      : String(err);

            // A sync that failed is the strongest evidence there is that the server is
            // not answering, and it arrived before the next scheduled beat would have.
            // The probe decides which it was: a lost server, or a request the server
            // answered with a refusal.
            void this.checkConnectivity();

            return false;
        } finally {
            this.syncing = null;
            // Anything queued while this one was in flight — including an op made
            // during a manual push or pull — goes out now.
            if (this.queuedSync) void this.drain();
        }
    }
}

type ConnectivityWatchOptions = {
    /** Called on every change of verdict, and once with the first one. */
    onChange?(online: boolean): unknown;
    /** Poll period while the server answers. Defaults to `HEARTBEAT_INTERVAL_MS`. */
    intervalMs?: number;
    /** Poll period while it does not. Defaults to `HEARTBEAT_OFFLINE_INTERVAL_MS`. */
    offlineIntervalMs?: number;
}
