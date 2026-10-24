import { env } from '$env/dynamic/private';
import { error, type RequestEvent } from '@sveltejs/kit';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { DEVICE_TOKEN_TTL_S } from '$lib/pos/deviceToken.server';

/**
 * Who may talk to the spigot routes, decided without PocketBase.
 *
 * Every other kiosk route proves the tablet through `resolveDevice`, which asks
 * PocketBase — and PocketBase is not at the venue. A pour has to get from the spigot to
 * the tablet with the uplink down, so both ends prove themselves with things the venue
 * server can check on its own:
 *
 *  - a **station** presents `SPIGOT_SECRET` as a bearer token;
 *  - a **kiosk** presents a ticket the server signed itself, handed out with the snapshot
 *    while PocketBase *was* there to vouch for the device.
 *
 * Both hang off the one secret. Whoever holds it could fake scans as well as mint tickets,
 * so a leak costs the same either way, and a second secret would only be a second thing
 * to configure. Unset means the venue has no stations, and the routes answer 503.
 */

type TicketPayload = {
    /** Device id — kept for the log, nothing checks it. */
    d: string;
    /** Bar slug the ticket is good for. */
    b: string;
    /** Expiry, in seconds since the epoch. */
    e: number;
};

function secret(): string | null {
    return env.SPIGOT_SECRET?.trim() || null;
}

export function spigotsEnabled(): boolean {
    return !!secret();
}

/** Refuses anything but a station holding the shared secret. */
export function requireStation(event: RequestEvent): void {
    const key = secret();
    if (!key) error(503, 'spigots-disabled');

    const authorization = event.request.headers.get('authorization') ?? '';
    const presented = authorization.replace(/^Bearer /i, '').trim();

    if (!presented || !sameSecret(presented, key)) error(401, 'spigot-secret-mismatch');
}

/**
 * The kiosk's pass to the spigot stream, or `null` when the venue has no stations.
 *
 * It lives as long as a device token. It cannot be revoked early — deactivating a device
 * stops it pulling a fresh one, and until it lapses all it grants is hearing pours.
 */
export function issueSpigotTicket(deviceId: string, barSlug: string): string | null {
    const key = secret();
    if (!key) return null;

    const payload: TicketPayload = {
        d: deviceId,
        b: barSlug,
        e: Math.floor(Date.now() / 1000) + DEVICE_TOKEN_TTL_S,
    };
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');

    return `${body}.${sign(key, body)}`;
}

/** Whether `ticket` is ours, unexpired, and for this bar. */
export function verifySpigotTicket(ticket: string | null, barSlug: string): boolean {
    const key = secret();
    if (!key || !ticket) return false;

    const [body, signature, ...rest] = ticket.split('.');
    if (!body || !signature || rest.length) return false;

    const expected = Buffer.from(sign(key, body));
    const presented = Buffer.from(signature);
    if (expected.length !== presented.length || !timingSafeEqual(expected, presented)) return false;

    let payload: Partial<TicketPayload>;
    try {
        payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    } catch {
        return false;
    }

    return payload.b === barSlug
        && typeof payload.e === 'number'
        && payload.e * 1000 > Date.now();
}

/** Domain-separated, so a ticket signature can never double as anything else signed here. */
function sign(key: string, body: string): string {
    return createHmac('sha256', key).update(`spigot-ticket:${body}`).digest('base64url');
}

/** Constant-time, whatever the lengths — hashing first makes them equal. */
function sameSecret(a: string, b: string): boolean {
    const digest = (value: string) => createHash('sha256').update(value).digest();
    return timingSafeEqual(digest(a), digest(b));
}
