import type { TapEvent } from './tapEvents';

type Listener = (event: TapEvent) => void;

const HUB_KEY = Symbol.for('baroo.tapHub');

/**
 * Kiosk and backstage streams per bar slug, which hear what is on the taps
 *
 * Kept on `globalThis` to survive vite hot reloads. Requires a single node process (pm2 `fork`),
 * otherwise a TapTapper and a kiosk could land in different workers.
 */
const listeners: Map<string, Set<Listener>> = ((globalThis as unknown as Record<symbol, Map<string, Set<Listener>> | undefined>)[HUB_KEY] ??= new Map());

/** Returns an idempotent unsubscribe */
export function subscribe(barSlug: string, send: Listener): () => void {
    const known = listeners.get(barSlug) ?? new Set<Listener>();
    listeners.set(barSlug, known);

    const listener: Listener = (event) => send(event);
    known.add(listener);

    return () => {
        known.delete(listener);
        if (!known.size && listeners.get(barSlug) === known) {
            listeners.delete(barSlug);
        }
    };
}

export function emit(ctx: Pick<App.Locals, "logger">, barSlug: string, event: TapEvent): void {
    for (const listener of listeners.get(barSlug) ?? []) {
        try {
            listener(event);
        } catch (err) {
            ctx.logger.error(err, '[taps] could not reach a listener');
        }
    }
}
