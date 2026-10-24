import type { SpigotEvent, SpigotStatus } from './spigotEvents';

type Listener = (event: SpigotEvent) => void;

type Hub = {
    /** Kiosk streams per bar slug */
    listeners: Map<string, Set<Listener>>;
    /** Stations per bar slug, keyed by spigot id */
    stations: Map<string, Map<string, SpigotStatus>>;
};

const STATION_FORGET_MS = 60 * 60_000;

const HUB_KEY = Symbol.for('baroo.spigotHub');

/**
 * In-memory meeting point of station requests and kiosk streams
 *
 * Kept on `globalThis` to survive vite hot reloads. Requires a single node process (pm2 `fork`),
 * otherwise a station and a kiosk could land in different workers.
 */
const hub: Hub = ((globalThis as unknown as Record<symbol, Hub | undefined>)[HUB_KEY] ??= {
    listeners: new Map(),
    stations: new Map(),
});

/** Returns an idempotent unsubscribe */
export function subscribe(barSlug: string, listener: Listener): () => void {
    const listeners = hub.listeners.get(barSlug) ?? new Set<Listener>();
    hub.listeners.set(barSlug, listeners);
    listeners.add(listener);

    return () => {
        listeners.delete(listener);
        if (!listeners.size && hub.listeners.get(barSlug) === listeners) {
            hub.listeners.delete(barSlug);
        }
    };
}

/** Returns the number of kiosks reached */
export function emit(ctx: Pick<App.Locals, "logger">, barSlug: string, event: SpigotEvent): number {
    let delivered = 0;

    for (const listener of hub.listeners.get(barSlug) ?? []) {
        try {
            listener(event);
            delivered++;
        } catch (err) {
            ctx.logger.error(err, '[spigots] could not reach a kiosk');
        }
    }

    return delivered;
}

export function listenerCount(barSlug: string): number {
    return hub.listeners.get(barSlug)?.size ?? 0;
}

/** Always re-emits the roster, kiosks judge liveness by the heartbeats */
export function touchStation(ctx: Pick<App.Locals, "logger">, barSlug: string, spigot: string, beverage: string | null): void {
    const stations = hub.stations.get(barSlug) ?? new Map<string, SpigotStatus>();
    hub.stations.set(barSlug, stations);

    stations.set(spigot, { spigot, beverage, lastSeenAt: new Date().toISOString() });

    emit(ctx, barSlug, rosterEvent(barSlug));
}

export function rosterEvent(barSlug: string): SpigotEvent {
    return { type: 'spigots', spigots: listStations(barSlug), at: new Date().toISOString() };
}

function listStations(barSlug: string): SpigotStatus[] {
    const stations = hub.stations.get(barSlug);
    if (!stations) return [];

    const forgetBefore = Date.now() - STATION_FORGET_MS;
    for (const [spigot, status] of stations) {
        if (Date.parse(status.lastSeenAt) < forgetBefore) stations.delete(spigot);
    }

    return [...stations.values()].sort((a, b) =>
        a.spigot.localeCompare(b.spigot, undefined, { numeric: true }),
    );
}
