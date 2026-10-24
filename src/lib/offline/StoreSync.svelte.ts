import { listOps, readDevice, readLastSyncAt } from './idb';
import type { BarOfflineStore } from './store.svelte';
import { NotEnrolledError, pullSnapshot, pushOutbox, type SyncResults } from './sync';


export default class StoreSync {
    syncing = $state<null | 'push' | 'pull'>(null);
    lastSyncAt = $state<string | null>(null);
    lastSyncResults = $state<SyncResults | null>(null);
    lastError = $state<string | null>(null);

    constructor(
        private bar: BarOfflineStore,
    ) {

    }

    public async init() {
        this.lastSyncAt = await readLastSyncAt()
    }

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

            if (results?.applied.length) {
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

    private async pushCore(): Promise<SyncResults|null> {
        const results = await pushOutbox(this.bar.barSlug);

        if (results) this.lastSyncResults = results;

        this.bar.pending = await listOps(this.bar.barSlug);
        this.lastSyncAt = await readLastSyncAt();

        return results;
    }

    private async pullCore(): Promise<void> {
        this.bar.snapshot = await pullSnapshot(this.bar.barSlug);
        this.bar.device = await readDevice();
    }

    /**
     * Asks for a background drain — after an op, or on finding ourselves online.
     *
     * Never awaited by callers, and never more than one sync in flight: a request that
     * arrives mid-sync is remembered and runs straight after, so an order placed while
     * the previous one is still uploading isn't left sitting in the buffer.
     */
    requestSync(mode: 'push' | 'sync' = 'push'): void {
        if (!this.bar.isEnrolled || !this.bar.lineCheck.online) return;

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
            while (this.queuedSync && this.bar.lineCheck.online) {
                const mode = this.queuedSync;
                this.queuedSync = null;

                // The in-flight push may already have carried the op that queued this one.
                if (mode === 'push' && !this.bar.pending.length) continue;

                // A failed sync leaves the outbox alone. Retrying here would only spin
                // against a server that just said no — the next op, or the next time we
                // come online, tries again.
                if (!(mode === 'sync' ? await this.sync() : await this.push())) return;
            }
        } finally {
            this.draining = false;
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
                    ? 'device-not-enrolled'
                    : err instanceof Error
                      ? err.message
                      : String(err);

            void this.bar.lineCheck.checkConnectivity();

            return false;
        } finally {
            this.syncing = null;
            // Anything queued while this one was in flight — including an op made
            // during a manual push or pull — goes out now.
            if (this.queuedSync) void this.drain();
        }
    }
}
