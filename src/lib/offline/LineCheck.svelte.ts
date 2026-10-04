import { isError } from "$lib/errors";
import { on } from "svelte/events";
import { heartbeatConfig, probeHeartbeat } from "./heartbeat";

export default class LineCheck {
    online = $state(true);
    lastHeartbeatAt = $state<string | null>(null);
    heartbeatError = $state<string | null>(null);

    watchConnectivity(opts?: ConnectivityWatchOptions): () => void {
        const interval = opts?.intervalMs ?? heartbeatConfig.interval.total("millisecond");
        const offlineInterval = opts?.offlineIntervalMs ?? heartbeatConfig.offlineInterval.total("millisecond");

        this.onConnectivityChange = opts?.onChange;

        let stopped = false;
        let timer: ReturnType<typeof setTimeout> | undefined;

        const beat = async () => {
            if (stopped) return;
            await this.checkConnectivity();
            if (stopped) return;

            clearTimeout(timer);
            timer = setTimeout(beat, this.online ? interval : offlineInterval);
        };

        const beatNow = () => {
            clearTimeout(timer);
            void beat();
        };

        const unregisters = [
            on(window, 'offline', () => this.setOnline(false, 'no-link')),
            on(window, 'online', beatNow),

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

    checkConnectivity(): Promise<boolean> {
        return (this.probing ??= this.runProbe().finally(() => this.probing = null));
    }

    private async runProbe(): Promise<boolean> {
        const beat = await probeHeartbeat(heartbeatConfig.timeout.total("millisecond"));
        if (isError(beat)) {
            this.setOnline(false, beat.error)
            return false
        }
        this.setOnline(true, null)
        this.lastHeartbeatAt = beat.at;

        return true;
    }

    private setOnline(online: boolean, reason: string | null) {
        const changed = this.online !== online || !this.connectivityKnown;

        this.online = online;
        this.heartbeatError = reason;
        this.connectivityKnown = true;

        if (changed) this.onConnectivityChange?.(online);
    }
}

type ConnectivityWatchOptions = {
    onChange?(online: boolean): unknown;
    intervalMs?: number;
    offlineIntervalMs?: number;
}
