import { env } from '$env/dynamic/private';
import { error, type RequestEvent } from '@sveltejs/kit';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Spigot routes must work without PocketBase, so both ends authenticate against the venue server:
 *  - a station presents `SPIGOT_SECRET` as a bearer token
 *  - a kiosk presents a ticket signed with the same secret, issued with the snapshot
 *
 * Unset secret disables the spigots
 */

/** Matches the device token lifetime */
const TICKET_TTL_S = 30 * 24 * 60 * 60;

type TicketPayload = {
    /** Device id */
    d: string;
    /** Bar slug */
    b: string;
    /** Expiry in unix seconds */
    e: number;
};

function secret(): string | null {
    return env.SPIGOT_SECRET?.trim() || null;
}

export function spigotsEnabled(): boolean {
    return !!secret();
}

export function requireStation(event: RequestEvent): void {
    const key = secret();
    if (!key) error(503, 'spigots-disabled');

    const authorization = event.request.headers.get('authorization') ?? '';
    const presented = authorization.replace(/^Bearer /i, '').trim();

    if (!presented || !sameSecret(presented, key)) error(401, 'spigot-secret-mismatch');
}

/** `null` when the spigots are disabled */
export function issueSpigotTicket(deviceId: string, barSlug: string): string | null {
    const key = secret();
    if (!key) return null;

    const payload: TicketPayload = {
        d: deviceId,
        b: barSlug,
        e: Math.floor(Date.now() / 1000) + TICKET_TTL_S,
    };
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');

    return `${body}.${sign(key, body)}`;
}

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

function sign(key: string, body: string): string {
    return createHmac('sha256', key).update(`spigot-ticket:${body}`).digest('base64url');
}

/** Hashing first makes the comparison constant-time regardless of lengths */
function sameSecret(a: string, b: string): boolean {
    const digest = (value: string) => createHash('sha256').update(value).digest();
    return timingSafeEqual(digest(a), digest(b));
}
