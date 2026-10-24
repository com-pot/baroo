import { source } from 'sveltekit-sse';
import { SPIGOT_TICKET_HEADER, type SpigotEvent, type SpigotStatus } from './spigotEvents';

/** After a connection drops: the server restarting, the wifi blinking. */
const RETRY_MS = 2_000;
/**
 * After the server said no — a lapsed ticket, or stations switched off. A pull can fix
 * either, so the kiosk keeps asking, just not often.
 */
const REFUSED_RETRY_MS = 30_000;

/** A station, with when this tablet last heard of it — by its own clock. */
export type HeardSpigot = SpigotStatus & { heardAt: number };

export type SpigotStreamOptions = {
    barSlug: string;
    /** Read afresh on every attempt: a pull in between may have replaced the ticket. */
    ticket: () => string | null;
    onEvent: (event: SpigotEvent) => void;
};

/**
 * The kiosk's end of the spigot stations.
 *
 * It keeps itself connected for as long as it runs. A venue server that restarts, or a
 * tablet whose wifi blinks, must not leave a bar whose pours quietly go nowhere — the
 * stations would signal "no kiosk" at every tap until someone reloaded the page.
 */
export class SpigotStream {
    /** Whether the stream is open right now. */
    connected = $state(false);
    /** The stations as the venue server last listed them. */
    spigots = $state<HeardSpigot[]>([]);

    constructor(private readonly opts: SpigotStreamOptions) {}

    /** Connects, and reconnects whenever it drops, until the returned teardown is called. */
    start(): () => void {
        let stopped = false;
        let retry: ReturnType<typeof setTimeout> | undefined;
        let disconnect = () => {};
        /** Which attempt is current, so a stale connection's callbacks are ignored. */
        let attempt = 0;

        const reconnectIn = (ms: number) => {
            clearTimeout(retry);
            if (!stopped) retry = setTimeout(connect, ms);
        };

        const connect = () => {
            // Claimed before the old connection is closed, so its close callback finds
            // itself stale instead of scheduling yet another attempt.
            const mine = ++attempt;
            disconnect();
            if (stopped) return;

            const ticket = this.opts.ticket();
            if (!ticket) return reconnectIn(REFUSED_RETRY_MS);

            const connection = source(`/api/bars/${encodeURIComponent(this.opts.barSlug)}/spigots/events`, {
                // Never shared: each attempt carries its own ticket, and a cached
                // connection that already closed would only hand back its silence.
                cache: false,
                options: { headers: { [SPIGOT_TICKET_HEADER]: ticket } },
                open: () => {
                    if (mine === attempt) this.connected = true;
                },
                close: ({ status }) => {
                    if (mine !== attempt) return;
                    this.connected = false;
                    reconnectIn(status >= 400 ? REFUSED_RETRY_MS : RETRY_MS);
                },
            });

            const unsubscribe = connection.select('message').subscribe((raw) => {
                const event = parse(raw);
                if (!event || mine !== attempt) return;

                if (event.type === 'spigots') this.spigots = heard(event.spigots, event.at);
                this.opts.onEvent(event);
            });

            // The last subscriber leaving is what closes a sveltekit-sse connection.
            disconnect = () => {
                disconnect = () => {};
                unsubscribe();
            };
        };

        connect();

        return () => {
            stopped = true;
            clearTimeout(retry);
            disconnect();
            this.connected = false;
        };
    }
}

/**
 * Ages, not timestamps: a tablet that has been offline all evening need not agree with
 * the venue server about the time, only about how long ago something was.
 */
function heard(spigots: SpigotStatus[], serverNow: string): HeardSpigot[] {
    const now = Date.now();
    const at = Date.parse(serverNow);

    return spigots.map((status) => ({
        ...status,
        heardAt: now - (at - Date.parse(status.lastSeenAt)),
    }));
}

function parse(raw: string): SpigotEvent | null {
    // The store holds an empty string until the first message arrives.
    if (!raw) return null;

    try {
        return JSON.parse(raw) as SpigotEvent;
    } catch {
        console.warn('[spigots] unreadable event:', raw);
        return null;
    }
}
