import z from 'zod';

/**
 * Messages between spigot stations, the venue server and the kiosk
 *
 * A spigot is an NFC station (Pico W + RC522) mounted at a tap. Named so to avoid clashing
 * with the `tap` serving preset and with tapping a card.
 */

export type SpigotStatus = {
    spigot: string;
    /** Offer item key, `null` until a beverage tag sets one */
    beverage: string | null;
    lastSeenAt: string;
};

/** Member card tapped at a station, waits on the kiosk for a serving */
export type SpigotPour = {
    type: 'pour';
    /** Minted by the venue server, the order's clientId derives from it */
    id: string;
    spigot: string;
    /** Normalized card serial */
    serialId: string;
    /** Offer item key as reported by the station */
    beverage: string;
    at: string;
};

/**
 * Each event carries a unique id or `at` - the kiosk reads them through a svelte store
 * which drops values equal to the previous one.
 */
export type SpigotEvent =
    /** `at` is the server clock the `lastSeenAt`s are measured against */
    | { type: 'spigots'; spigots: SpigotStatus[]; at: string }
    | SpigotPour
    | { type: 'spigot-assigned'; spigot: string; beverage: string; name: string; at: string }
    | { type: 'spigot-unset'; spigot: string; serialId: string; at: string };

export type SpigotScanResult =
    | { result: 'beverage'; beverage: { key: string; name: string } }
    | { result: 'no-beverage' }
    /** `delivered` - number of kiosks listening */
    | { result: 'pour'; delivered: number };

export const SPIGOT_TICKET_HEADER = 'x-spigot-ticket';

/** Three missed 30 s heartbeats */
export const SPIGOT_STALE_MS = 90_000;

const spigotId = z.string().regex(/^[a-z0-9-]{1,16}$/);
const beverageKey = z.string().regex(/^[a-z0-9-]{0,32}$/).nullish();

export const spigotScanSchema = z.object({
    spigot: spigotId,
    uid: z.string().regex(/^[0-9a-f:]{4,40}$/i),
    beverage: beverageKey,
});

export const spigotHelloSchema = z.object({
    spigot: spigotId,
    beverage: beverageKey,
});
