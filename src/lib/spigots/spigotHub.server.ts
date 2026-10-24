import type { SpigotEvent, SpigotStatus } from './spigotEvents';

type Listener = (event: SpigotEvent) => void;

type Hub = {
    /** Open kiosk streams, per bar slug. */
    listeners: Map<string, Set<Listener>>;
    /** Stations heard from, per bar slug, keyed by spigot id. */
    stations: Map<string, Map<string, SpigotStatus>>;
};

/** A station silent for this long is dropped — renamed, unplugged for the night. */
const STATION_FORGET_MS = 60 * 60_000;

const HUB_KEY = Symbol.for('baroo.spigotHub');

/**
 * The meeting point of station POSTs and kiosk streams. Memory only, by design: none of it
 * may wait on PocketBase, and none of it is worth keeping — a pour nobody heard is retried
 * by the customer tapping again, and stations re-introduce themselves every 30 s.
 *
 * Parked on `globalThis` so a vite hot reload of this module does not strand the streams
 * opened against the copy it replaces. One per node process, which is why pm2 must stay on
 * `fork`, as for the counters: under `cluster` a station's POST and the kiosk's stream can
 * land in different workers and never meet.
 */
const hub: Hub = ((globalThis as unknown as Record<symbol, Hub | undefined>)[HUB_KEY] ??= {
    listeners: new Map(),
    stations: new Map(),
});

/** Registers a kiosk stream for a bar. Returns the unsubscribe, which is safe to call twice. */
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

/**
 * Sends to every kiosk listening on the bar, and says how many it reached — a station
 * whose pour reached nobody signals it, so the customer knows to tell the barman.
 */
export function emit(barSlug: string, event: SpigotEvent): number {
    let delivered = 0;

    for (const listener of hub.listeners.get(barSlug) ?? []) {
        try {
            listener(event);
            delivered++;
        } catch (err) {
            // One stream that has died must not swallow the event for the rest.
            console.error('[spigots] could not reach a kiosk:', err);
        }
    }

    return delivered;
}

export function listenerCount(barSlug: string): number {
    return hub.listeners.get(barSlug)?.size ?? 0;
}

/**
 * Records that a station spoke, and passes the roster on.
 *
 * Every time, not only when something changed: the kiosk judges a station alive by how
 * recently it was heard, and a heartbeat nobody forwards would read as silence.
 */
export function touchStation(barSlug: string, spigot: string, beverage: string | null): void {
    const stations = hub.stations.get(barSlug) ?? new Map<string, SpigotStatus>();
    hub.stations.set(barSlug, stations);

    stations.set(spigot, { spigot, beverage, lastSeenAt: new Date().toISOString() });

    emit(barSlug, rosterEvent(barSlug));
}

/** The bar's stations as an event, stamped with the server's clock. */
export function rosterEvent(barSlug: string): SpigotEvent {
    return { type: 'spigots', spigots: listStations(barSlug), at: new Date().toISOString() };
}

/** The bar's stations in display order — "2" before "10". */
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
