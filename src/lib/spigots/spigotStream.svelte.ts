import { source } from 'sveltekit-sse';
import { SPIGOT_TICKET_HEADER, type SpigotEvent, type SpigotStatus } from './spigotEvents';

const RETRY_MS = 2_000;
/** Lapsed ticket or disabled spigots, a later pull may fix either */
const REFUSED_RETRY_MS = 30_000;

/** `heardAt` is by the tablet's clock */
export type HeardSpigot = SpigotStatus & { heardAt: number };

export type SpigotStreamOptions = {
    barSlug: string;
    /** Read on every attempt, a pull may have replaced the ticket */
    ticket: () => string | null;
    onEvent: (event: SpigotEvent) => void;
};

/** Kiosk's connection to the spigot stations, reconnects until stopped */
export class SpigotStream {
    connected = $state(false);
    spigots = $state<HeardSpigot[]>([]);

    constructor(private readonly opts: SpigotStreamOptions) {}

    start(): () => void {
        let stopped = false;
        let retry: ReturnType<typeof setTimeout> | undefined;
        let disconnect = () => {};
        /** Callbacks of stale connections are ignored */
        let attempt = 0;

        const reconnectIn = (ms: number) => {
            clearTimeout(retry);
            if (!stopped) retry = setTimeout(connect, ms);
        };

        const connect = () => {
            // Claimed before disconnecting so the old close callback sees itself stale
            const mine = ++attempt;
            disconnect();
            if (stopped) return;

            const ticket = this.opts.ticket();
            if (!ticket) return reconnectIn(REFUSED_RETRY_MS);

            const connection = source(`/api/bars/${encodeURIComponent(this.opts.barSlug)}/spigots/events`, {
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

            // Last subscriber leaving closes a sveltekit-sse connection
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

/** Converts server timestamps to ages, the tablet's clock may differ */
function heard(spigots: SpigotStatus[], serverNow: string): HeardSpigot[] {
    const now = Date.now();
    const at = Date.parse(serverNow);

    return spigots.map((status) => ({
        ...status,
        heardAt: now - (at - Date.parse(status.lastSeenAt)),
    }));
}

function parse(raw: string): SpigotEvent | null {
    if (!raw) return null;

    try {
        return JSON.parse(raw) as SpigotEvent;
    } catch {
        console.warn('[spigots] unreadable event:', raw);
        return null;
    }
}
