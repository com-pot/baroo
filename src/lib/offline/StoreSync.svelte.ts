import { isError } from '$lib/errors';
import { listOps, readDevice, readLastSyncAt } from './idb';
import type { BarOfflineStore } from './store.svelte';
import { pullSnapshot, pushOutbox, type SyncResults } from './sync';

type SyncRequest = 'push' | 'sync'

export default class StoreSync {
    syncing = $state<null | 'push' | 'pull'>(null);
    lastSyncAt = $state<string | null>(null);
    lastSyncResults = $state<SyncResults | null>(null);
    lastError = $state<App.Error | null>(null);

    constructor(
        private bar: BarOfflineStore,
    ) {

    }

    public async init() {
        this.lastSyncAt = await readLastSyncAt()
    }

    private queuedSync: SyncRequest | null = null;
    public requestSync(mode: SyncRequest): void {
        if (!this.bar.isEnrolled || !this.bar.lineCheck.online) return;

        this.queuedSync = this.queuedSync === 'sync' ? 'sync' : mode;

        if (this.syncing) return;
        void this.drain();
    }

    private async push(pull: "always" | "if-changes" = "if-changes") {
        return this.runSync('push', async (): Promise<SyncResults|null> => {
            const results = await pushOutbox(this.bar.barSlug);
            if (results) this.lastSyncResults = results;

            this.bar.pending = await listOps(this.bar.barSlug);
            this.lastSyncAt = await readLastSyncAt();

            return results;
        })
            .then((results) => {
                const shouldPull = pull === "always" || (results !== false && results?.applied.length)
                if (shouldPull) return this.pull()

                return true
            })
    }

    private async pull() {
        return this.runSync('pull', async () => {
            this.bar.snapshot = await pullSnapshot(this.bar.barSlug);
            this.bar.device = await readDevice();
            return true
        });
    }

    private draining = false;
    private async drain(): Promise<void> {
        if (this.draining) return;
        this.draining = true;

        try {
            while (this.queuedSync && this.bar.lineCheck.online) {
                const mode = this.queuedSync;
                this.queuedSync = null;

                if (mode === 'push' && !this.bar.pending.length) continue;

                const syncOk = mode === 'sync' ? await this.push("always") : await this.push()
                // failed push = sync channel unavailable, stop trying
                if (!syncOk) return;
            }
        } finally {
            this.draining = false;
        }
    }

    private async runSync<T>(mode: 'push' | 'pull', work: () => Promise<T>): Promise<T|false> {
        if (this.syncing) return false;

        this.syncing = mode;
        this.lastError = null;
        try {
            const result = await work();
            return result
        } catch (err) {
            this.lastError = formatError(err)
            void this.bar.lineCheck.checkConnectivity();

            return false
        } finally {
            this.syncing = null;
            this.drain();
        }
    }
}


function formatError(err: unknown): App.Error {
    if (err instanceof Error) {
        return err
    }

    if (isError(err)) {
        return {
            message: err.error,
            details: err.data && 'details' in err.data && err.data.details ? err.data.details : err.data
        }
    }

    return { message: String(err) }
}
