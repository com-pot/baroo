import { source } from 'sveltekit-sse';
import type { OutboxOp } from '$lib/offline/op';
import { TAP_TICKET_HEADER, type RelayedOp, type TapEvent, type TapState } from './tapEvents';

const RETRY_MS = 2_000;
/** Lapsed ticket or disabled TapTappers, a later pull may fix either */
const REFUSED_RETRY_MS = 30_000;

/** `heardAt` - when the TapTapper last checked in, by the tablet's clock */
export type HeardTap = TapState & { heardAt: number | null };

export type TapStreamOptions = {
    barSlug: string;
    /**
     * Read on every attempt, a pull may have replaced the ticket. Left out, the stream relies
     * on the bar manager's session instead - backstage has no ticket
     */
    ticket?: () => string | null;
    onEvent?: (event: TapEvent) => void;
};

/** Connection to the venue server's taps, reconnects until stopped */
export class TapStream {
    /** Once the server told what is on the taps, it does so first thing */
    connected = $state(false);
    taps = $state<HeardTap[]>([]);

    constructor(private readonly opts: TapStreamOptions) {}

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

            const ticket = this.opts.ticket?.() ?? null;
            if (this.opts.ticket && !ticket) return reconnectIn(REFUSED_RETRY_MS);

            const connection = source(this.url('events'), {
                cache: false,
                options: { headers: ticket ? { [TAP_TICKET_HEADER]: ticket } : {} },
                close: ({ status }) => {
                    if (mine !== attempt) return;
                    this.connected = false;
                    reconnectIn(status >= 400 ? REFUSED_RETRY_MS : RETRY_MS);
                },
            });

            const unsubscribe = connection.select('message').subscribe((raw) => {
                const event = parse(raw);
                if (!event || mine !== attempt) return;

                if (event.type === 'taps') {
                    this.taps = heard(event.taps, event.at);
                    this.connected = true;
                }
                this.opts.onEvent?.(event);
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

    /** Tells the venue server what this kiosk filed, so the taps show it before any sync */
    relay(op: OutboxOp): Promise<void> {
        const relayed = relayedOp(op);
        return relayed ? this.post('ops', { ops: [relayed] }) : Promise.resolve();
    }

    /** The other kiosks drop the offer too, and its TapTapper stops waiting */
    dismiss(offer: string): Promise<void> {
        return this.post('dismiss', { offer });
    }

    /** Never throws, whatever doesn't get through the sync and the next pull settle */
    private async post(path: string, body: unknown): Promise<void> {
        const ticket = this.opts.ticket?.();
        if (!ticket) return;

        try {
            const response = await fetch(this.url(path), {
                method: 'POST',
                headers: { 'content-type': 'application/json', [TAP_TICKET_HEADER]: ticket },
                body: JSON.stringify(body),
            });
            if (!response.ok) console.warn(`[taps] ${path}: HTTP ${response.status}`);
        } catch (err) {
            console.warn(`[taps] ${path} failed:`, err);
        }
    }

    private url(path: string): string {
        return `/api/bars/${encodeURIComponent(this.opts.barSlug)}/taps/${path}`;
    }
}

function relayedOp(op: OutboxOp): RelayedOp | null {
    const meta = { clientId: op.clientId, occurredAt: op.occurredAt };

    switch (op.kind) {
        case 'order':
            return { ...meta, kind: 'order', items: op.items.map(({ key, variant }) => ({ key, variant })) };
        case 'unseal':
            return {
                ...meta,
                kind: 'unseal',
                offerItemKey: op.offerItemKey,
                quantity: op.quantity,
                tap: op.tap ?? null,
                packageId: op.packageId ?? null,
                flushCurrent: op.flushCurrent,
            };
        case 'flush':
            return { ...meta, kind: 'flush', offerItemKey: op.offerItemKey, tap: op.tap ?? null };
        default:
            return null;
    }
}

/** Converts server timestamps to ages, the tablet's clock may differ */
function heard(taps: TapState[], serverNow: string): HeardTap[] {
    const now = Date.now();
    const at = Date.parse(serverNow);

    return taps.map((state) => ({
        ...state,
        heardAt: state.tapper ? now - (at - Date.parse(state.tapper.lastSeenAt)) : null,
    }));
}

function parse(raw: string): TapEvent | null {
    if (!raw) return null;

    try {
        return JSON.parse(raw) as TapEvent;
    } catch {
        console.warn('[taps] unreadable event:', raw);
        return null;
    }
}
