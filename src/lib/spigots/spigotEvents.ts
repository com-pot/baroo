import z from 'zod';

/**
 * What travels between the spigot stations, the venue server and the kiosk.
 *
 * A *spigot* is one NFC station mounted at a tap — a Pico W with an RC522 reader. It is
 * called that here rather than a "tap" because that word is taken twice over already: the
 * `tap` serving preset, and tapping a card on a reader.
 *
 * A station knows almost nothing. The venue server tells it which tags are drinks, and
 * only the kiosk knows who the members are — the same offline snapshot and outbox that
 * every other way into the kiosk reads.
 */

/** One station, as the venue server last heard from it. */
export type SpigotStatus = {
    spigot: string;
    /** Offer item key the station pours, or `null` until a beverage tag has set one. */
    beverage: string | null;
    lastSeenAt: string;
};

/** A member card tapped at a station that knows its drink. Waits on the kiosk for a size. */
export type SpigotPour = {
    type: 'pour';
    /** Minted by the venue server. The order the kiosk files for it is keyed off this. */
    id: string;
    spigot: string;
    /** The card serial, already through `normalizeTag`. */
    serialId: string;
    /** Offer item key, as the station reported it. Not checked against the offer. */
    beverage: string;
    at: string;
};

/**
 * Every event carries something that differs from the last one — an id, or `at`. The
 * kiosk reads the stream through a Svelte store, and a store passes a value equal to the
 * previous one on to nobody: the same beverage tag tapped twice would vanish the second time.
 */
export type SpigotEvent =
    /** The roster. `at` is the server's clock, which the `lastSeenAt`s are measured against. */
    | { type: 'spigots'; spigots: SpigotStatus[]; at: string }
    | SpigotPour
    | { type: 'spigot-assigned'; spigot: string; beverage: string; name: string; at: string }
    /** A member card at a station that has not been told its drink yet. */
    | { type: 'spigot-unset'; spigot: string; serialId: string; at: string };

/** What a station hears back from a scan. The firmware turns each into a signal. */
export type SpigotScanResult =
    | { result: 'beverage'; beverage: { key: string; name: string } }
    | { result: 'no-beverage' }
    /** `delivered` is how many kiosks were listening. Zero means the pour went nowhere. */
    | { result: 'pour'; delivered: number };

/** Where the kiosk presents its ticket to the spigot stream — see `spigotAuth.server.ts`. */
export const SPIGOT_TICKET_HEADER = 'x-spigot-ticket';

/**
 * How long a station may stay quiet before the kiosk shows it as gone. Stations say hello
 * every 30 s, so this is three missed heartbeats.
 */
export const SPIGOT_STALE_MS = 90_000;

const spigotId = z.string().regex(/^[a-z0-9-]{1,16}$/);
/** What the station remembers pouring. `null` and `""` both mean nothing yet. */
const beverageKey = z.string().regex(/^[a-z0-9-]{0,32}$/).nullish();

export const spigotScanSchema = z.object({
    spigot: spigotId,
    /** Card UID as hex. Separators are tolerated; `normalizeTag` strips them. */
    uid: z.string().regex(/^[0-9a-f:]{4,40}$/i),
    beverage: beverageKey,
});

export const spigotHelloSchema = z.object({
    spigot: spigotId,
    beverage: beverageKey,
});
