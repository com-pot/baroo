import type { Db } from '$lib/db.server';
import type { TapListenerRole } from './tapAuth.server';
import type { TapEvent } from './tapEvents';

type Listener = { role: TapListenerRole; send: (event: TapEvent) => void };

/** Member card tapped at a TapTapper, until a serving or a dismissal settles it */
export type PendingOffer = {
    id: string;
    barId: string;
    tap: string;
    serialId: string;
    memberId: string;
    offerItemKey: string;
    at: string;
    state: 'pending' | 'served' | 'dismissed';
    /** The serving it got */
    variant?: string;
    /** The tap's own session - the tap files the order, wherever the serving is picked */
    pb: Db;
};

type Hub = {
    /** Kiosk and backstage streams per bar slug */
    listeners: Map<string, Set<Listener>>;
    /** Offers per bar slug, keyed by id */
    offers: Map<string, Map<string, PendingOffer>>;
};

const OFFER_FORGET_MS = 30 * 60_000;

const HUB_KEY = Symbol.for('baroo.tapHub');

/**
 * In-memory meeting point of TapTapper requests and kiosk streams
 *
 * Kept on `globalThis` to survive vite hot reloads. Requires a single node process (pm2 `fork`),
 * otherwise a TapTapper and a kiosk could land in different workers.
 */
const hub: Hub = ((globalThis as unknown as Record<symbol, Hub | undefined>)[HUB_KEY] ??= {
    listeners: new Map(),
    offers: new Map(),
});

/** Returns an idempotent unsubscribe */
export function subscribe(barSlug: string, role: TapListenerRole, send: Listener["send"]): () => void {
    const listeners = hub.listeners.get(barSlug) ?? new Set<Listener>();
    hub.listeners.set(barSlug, listeners);

    const listener: Listener = { role, send };
    listeners.add(listener);

    return () => {
        listeners.delete(listener);
        if (!listeners.size && hub.listeners.get(barSlug) === listeners) {
            hub.listeners.delete(barSlug);
        }
    };
}

/** Kiosks of any kind, or staff kiosks only - observers never count */
export type Counted = 'kiosks' | 'staff';

/** Reaches every listener, returns how many of the `counted` ones it reached */
export function emit(ctx: Pick<App.Locals, "logger">, barSlug: string, event: TapEvent, counted: Counted = 'kiosks'): number {
    let delivered = 0;

    for (const listener of hub.listeners.get(barSlug) ?? []) {
        try {
            listener.send(event);
            if (counts(listener, counted)) delivered++;
        } catch (err) {
            ctx.logger.error(err, '[taps] could not reach a listener');
        }
    }

    return delivered;
}

export function listenerCount(barSlug: string, counted: Counted = 'kiosks'): number {
    return [...hub.listeners.get(barSlug) ?? []].filter((listener) => counts(listener, counted)).length;
}

function counts(listener: Listener, counted: Counted): boolean {
    return counted === 'staff' ? listener.role === 'staff' : listener.role !== 'observer';
}

export function openOffer(barSlug: string, offer: Omit<PendingOffer, 'state'>): PendingOffer {
    const pending: PendingOffer = { ...offer, state: 'pending' };
    offers(barSlug).set(offer.id, pending);
    return pending;
}

export function findOffer(barSlug: string, id: string): PendingOffer | undefined {
    return offers(barSlug).get(id);
}

/** The offer when it was pending until now, `null` when it was settled already or forgotten */
export function settleOffer(barSlug: string, id: string, state: 'served' | 'dismissed', variant?: string): PendingOffer | null {
    const offer = offers(barSlug).get(id);
    if (!offer || offer.state !== 'pending') return null;

    offer.state = state;
    offer.variant = variant;
    return offer;
}

function offers(barSlug: string): Map<string, PendingOffer> {
    const known = hub.offers.get(barSlug) ?? new Map<string, PendingOffer>();
    hub.offers.set(barSlug, known);

    const forgetBefore = Date.now() - OFFER_FORGET_MS;
    for (const [id, offer] of known) {
        if (Date.parse(offer.at) < forgetBefore) known.delete(id);
    }

    return known;
}
