import { source } from 'sveltekit-sse';
import type { TapEvent, TapState } from './tapEvents';

const RETRY_MS = 2_000;
/** Lapsed token or no PocketBase, a later pull may fix either */
const REFUSED_RETRY_MS = 30_000;

/** `heardAt` - when the TapTapper last checked in, by the tablet's clock */
export type HeardTap = TapState & { heardAt: number | null };

export type TapStreamOptions = {
    barSlug: string;
    /**
     * The kiosk's device token, read on every attempt - a pull may have replaced it. Left
     * out, the stream relies on the bar manager's session instead
     */
    token?: () => string | null;
    onEvent?: (event: TapEvent) => void;
};

/** Connection to the server's taps, reconnects until stopped */
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

            const token = this.opts.token?.() ?? null;
            if (this.opts.token && !token) return reconnectIn(REFUSED_RETRY_MS);

            const connection = source(this.url('events'), {
                cache: false,
                options: { headers: token ? { authorization: `Bearer ${token}` } : {} },
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

    /** The offer's tap files the order. Throws when it didn't */
    async serve(offer: string, variant: string): Promise<void> {
        const response = await this.post(`offers/${encodeURIComponent(offer)}/serve`, { variant });
        if (!response.ok) {
            const body = await response.json().catch(() => null) as { message?: string } | null;
            throw new Error(body?.message ?? `HTTP ${response.status}`);
        }
    }

    /** The other kiosks drop the offer too, and its TapTapper stops waiting. Never throws */
    async dismiss(offer: string): Promise<void> {
        try {
            const response = await this.post('dismiss', { offer });
            if (!response.ok) console.warn(`[taps] dismiss: HTTP ${response.status}`);
        } catch (err) {
            console.warn('[taps] dismiss failed:', err);
        }
    }

    private post(path: string, body: unknown): Promise<Response> {
        const token = this.opts.token?.();

        return fetch(this.url(path), {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify(body),
        });
    }

    private url(path: string): string {
        return `/api/bars/${encodeURIComponent(this.opts.barSlug)}/taps/${path}`;
    }
}

/** Converts server timestamps to ages, the tablet's clock may differ */
function heard(taps: TapState[], serverNow: string): HeardTap[] {
    const now = Date.now();
    const at = Date.parse(serverNow);

    return taps.map((state) => ({
        ...state,
        heardAt: state.lastSeenAt ? now - (at - Date.parse(state.lastSeenAt)) : null,
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
