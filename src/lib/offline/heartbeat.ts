/**
 * The kiosk's definition of "online": the server answered.
 *
 * `navigator.onLine` only knows whether the tablet has a link — it says yes to a wifi
 * network whose uplink is down, and a bar's router does exactly that often enough to
 * matter. So connectivity here is a question put to the server, on the same path the
 * sync calls use, and the answer is whatever came back.
 */

export const HEARTBEAT_PATH = '/api/heartbeat';

/** How often to ask while the answer keeps being yes. */
export const HEARTBEAT_INTERVAL_MS = 30_000;

/** How often to ask while offline — a reconnect should show up on the badge quickly. */
export const HEARTBEAT_OFFLINE_INTERVAL_MS = 5_000;

/**
 * How long to wait for an answer. Short: a heartbeat that hangs is indistinguishable
 * from an absent server as far as pouring drinks is concerned.
 */
export const HEARTBEAT_TIMEOUT_MS = 4_000;

export type Heartbeat =
    /** The server answered, and it can reach its data. */
    | { ok: true; at: string }
    /** No answer, or the server said it is not fit to sync. */
    | { ok: false; reason: string };

/**
 * One probe.
 *
 * Never throws: an unreachable server is the answer we came for, not a failure. The
 * reason is a machine string for the staff console, not something to show a barman.
 */
export async function probeHeartbeat(timeoutMs = HEARTBEAT_TIMEOUT_MS): Promise<Heartbeat> {
    try {
        const response = await fetch(HEARTBEAT_PATH, {
            // No conditional requests, no service-worker copy — the point is the round-trip.
            cache: 'no-store',
            headers: { accept: 'application/json' },
            signal: AbortSignal.timeout(timeoutMs),
        });

        const body = (await response.json().catch(() => null)) as
            | { ok?: boolean; at?: string; reason?: string }
            | null;

        // A proxy or captive portal can answer 200 with something that is not us; the
        // `ok` flag in the body is what makes this our server and not a hotel login page.
        if (!response.ok || body?.ok !== true) {
            return { ok: false, reason: body?.reason || `heartbeat-${response.status}` };
        }

        return { ok: true, at: body.at || new Date().toISOString() };
    } catch (err) {
        return {
            ok: false,
            reason: err instanceof DOMException && err.name === 'TimeoutError'
                ? 'heartbeat-timeout'
                : 'heartbeat-unreachable',
        };
    }
}
