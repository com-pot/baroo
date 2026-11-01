import { env } from '$env/dynamic/private';
import { error, type RequestEvent } from '@sveltejs/kit';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { PosDeviceKind } from '$lib/pos/device';
import { TAP_TICKET_HEADER } from './tapEvents';

/**
 * Tap routes must work without PocketBase, so both ends authenticate against the venue server:
 *  - a TapTapper presents `TAP_SECRET` as a bearer token
 *  - a kiosk presents a ticket signed with the same secret, issued with the snapshot
 *
 * Unset secret disables the TapTappers
 */

/** Matches the device token lifetime */
const TICKET_TTL_S = 30 * 24 * 60 * 60;

type TicketPayload = {
    /** Device id */
    d: string;
    /** Device kind, missing in tickets from before it was needed */
    k?: PosDeviceKind;
    /** Bar slug */
    b: string;
    /** Expiry in unix seconds */
    e: number;
};

/** Staff kiosks file unseals and flushes, observers (backstage) only watch */
export type TapListenerRole = PosDeviceKind | 'observer';

function secret(): string | null {
    return env.TAP_SECRET?.trim() || null;
}

export function tapsEnabled(): boolean {
    return !!secret();
}

export function requireTapper(event: RequestEvent): void {
    const key = secret();
    if (!key) error(503, 'taps-disabled');

    const authorization = event.request.headers.get('authorization') ?? '';
    const presented = authorization.replace(/^Bearer /i, '').trim();

    if (!presented || !sameSecret(presented, key)) error(401, 'tap-secret-mismatch');
}

/** The kiosk behind a request, by its ticket */
export function requireTapKiosk(event: RequestEvent): { deviceId: string; kind: PosDeviceKind } {
    if (!tapsEnabled()) error(503, 'taps-disabled');

    const kiosk = verifyTapTicket(event.request.headers.get(TAP_TICKET_HEADER), event.params.ref ?? '');
    if (!kiosk) error(401, 'tap-ticket-invalid');

    return kiosk;
}

/** Kiosks by their ticket, backstage by the bar manager's session */
export function tapListenerRole(event: RequestEvent): TapListenerRole | null {
    const kiosk = verifyTapTicket(event.request.headers.get(TAP_TICKET_HEADER), event.params.ref ?? '');
    if (kiosk) return kiosk.kind;

    return event.locals.acl.hasRole('bar-manager') ? 'observer' : null;
}

/** `null` when the TapTappers are disabled */
export function issueTapTicket(deviceId: string, kind: PosDeviceKind, barSlug: string): string | null {
    const key = secret();
    if (!key) return null;

    const payload: TicketPayload = {
        d: deviceId,
        k: kind,
        b: barSlug,
        e: Math.floor(Date.now() / 1000) + TICKET_TTL_S,
    };
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');

    return `${body}.${sign(key, body)}`;
}

export function verifyTapTicket(ticket: string | null, barSlug: string): { deviceId: string; kind: PosDeviceKind } | null {
    const key = secret();
    if (!key || !ticket) return null;

    const [body, signature, ...rest] = ticket.split('.');
    if (!body || !signature || rest.length) return null;

    const expected = Buffer.from(sign(key, body));
    const presented = Buffer.from(signature);
    if (expected.length !== presented.length || !timingSafeEqual(expected, presented)) return null;

    let payload: Partial<TicketPayload>;
    try {
        payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    } catch {
        return null;
    }

    if (payload.b !== barSlug || typeof payload.e !== 'number' || payload.e * 1000 <= Date.now()) return null;

    return { deviceId: String(payload.d), kind: payload.k === 'staff' ? 'staff' : 'kiosk' };
}

function sign(key: string, body: string): string {
    return createHmac('sha256', key).update(`tap-ticket:${body}`).digest('base64url');
}

/** Hashing first makes the comparison constant-time regardless of lengths */
function sameSecret(a: string, b: string): boolean {
    const digest = (value: string) => createHash('sha256').update(value).digest();
    return timingSafeEqual(digest(a), digest(b));
}
