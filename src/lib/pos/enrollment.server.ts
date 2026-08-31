import { randomInt } from 'node:crypto';
import { ClientResponseError } from 'pocketbase';
import { superuserDb, type Db } from '$lib/db.server';
import type { DeviceIdentity } from '$lib/offline/types';
import { mintDeviceToken } from './deviceToken.server';
import { readPosConfig } from './device';
import { enrollmentCodeState, type PosEnrollmentCode } from './enrollmentCode';

export const ENROLLMENT_CODES = 'pos_enrollment_codes';

/** Long enough to walk a tablet over, short enough that a guessed code is worthless. */
export const ENROLLMENT_CODE_TTL_MS = 60 * 60 * 1000;

/** The unique index makes a clash a failed write, so a couple of tries is plenty. */
const MAX_CODE_ATTEMPTS = 10;

export type ClaimFailure = 'unknown-code' | 'expired' | 'device-inactive' | 'unavailable';

export type ClaimResult =
    | { ok: true; identity: DeviceIdentity }
    | { ok: false; reason: ClaimFailure };

/**
 * Issues a fresh code for a device, replacing whatever it had outstanding.
 *
 * Runs as the acting barman — issuing only needs the rights backstage already has. Only
 * *claiming* needs a superuser, because the tablet doing it has no session at all.
 */
export async function issueEnrollmentCode(
    pb: Db,
    deviceId: string,
): Promise<{ code: string; expiresAt: string }> {
    const expiresAt = new Date(Date.now() + ENROLLMENT_CODE_TTL_MS).toISOString();

    // One code per device — the collection enforces it, so the old one has to go first.
    await revokeEnrollmentCode(pb, deviceId);

    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
        const code = generateCode();

        try {
            await pb.collection(ENROLLMENT_CODES).create({ code, device: deviceId, expiresAt });

            return { code, expiresAt };
        } catch (err) {
            // Another live code already holds this number. PocketBase reports a clash
            // either as a field error or as a bare 400 from SQLite, and this write has
            // nothing else to be 400 about — so treat both as "try another number".
            if (!isRejectedWrite(err)) throw err;
        }
    }

    throw new Error('could not find a free enrollment code');
}

/** Drops whatever code a device has outstanding. Silent when it has none. */
export async function revokeEnrollmentCode(pb: Db, deviceId: string): Promise<void> {
    const existing = await pb.collection<PosEnrollmentCode>(ENROLLMENT_CODES).getFullList({
        filter: pb.filter('device = {:device}', { device: deviceId }),
    });

    for (const code of existing) {
        await pb.collection(ENROLLMENT_CODES).delete(code.id);
    }
}

/**
 * Trades a code for a device identity and a token minted for it.
 *
 * The code row is deleted only once the token exists, so a failed mint leaves it usable
 * for another try instead of burning the manager's trip to the tablet.
 */
export async function claimEnrollmentCode(code: string): Promise<ClaimResult> {
    const pb = await superuserDb();
    if (!pb) return { ok: false, reason: 'unavailable' };

    let issued: PosEnrollmentCode;
    try {
        issued = await pb.collection<PosEnrollmentCode>(ENROLLMENT_CODES).getFirstListItem(
            pb.filter('code = {:code}', { code }),
            { expand: 'device,device.bar' },
        );
    } catch (err) {
        if (err instanceof ClientResponseError && err.status === 404) {
            return { ok: false, reason: 'unknown-code' };
        }
        console.error('pairing lookup failed:', err);
        return { ok: false, reason: 'unavailable' };
    }

    // An expired row is kept, not deleted: backstage still needs to show that this device
    // is waiting on a code that lapsed.
    if (enrollmentCodeState(issued) !== 'pending') {
        return { ok: false, reason: 'expired' };
    }

    const device = issued.expand?.device;
    if (!device) {
        console.error(`enrollment code ${issued.id} points at no device`);
        return { ok: false, reason: 'unavailable' };
    }

    if (!device.active) {
        return { ok: false, reason: 'device-inactive' };
    }

    const bar = device.expand?.bar;
    if (!bar) {
        console.error(`device ${device.id} has no bar to pair into`);
        return { ok: false, reason: 'unavailable' };
    }

    if (!device.enrolledBy) {
        console.error(`device ${device.id} has no enrolledBy, so no identity to act as`);
        return { ok: false, reason: 'unavailable' };
    }

    let token: string;
    try {
        token = await mintDeviceToken(device.enrolledBy);
    } catch (err) {
        console.error(`could not mint a token for device ${device.id}:`, err);
        return { ok: false, reason: 'unavailable' };
    }

    // Single use: the code is spent the moment it works.
    await pb.collection(ENROLLMENT_CODES).delete(issued.id);
    await pb.collection('pos_devices').update(device.id, { lastSeen: new Date().toISOString() });

    return {
        ok: true,
        identity: {
            deviceId: device.id,
            token,
            label: device.label,
            kind: device.kind,
            barSlug: bar.slug,
            barName: bar.name,
            enrolledAt: new Date().toISOString(),
            config: readPosConfig(device.config),
        },
    };
}

/** The outstanding code per device id, for a bar's devices tab. */
export async function listEnrollmentCodes(
    pb: Db,
    barSlug: string,
): Promise<Map<string, PosEnrollmentCode>> {
    const codes = await pb.collection<PosEnrollmentCode>(ENROLLMENT_CODES).getFullList({
        filter: pb.filter('device.bar.slug = {:slug}', { slug: barSlug }),
    });

    return new Map(codes.map(code => [code.device, code]));
}

// --- guessing throttle ------------------------------------------------------
//
// Four digits is 10 000 codes, so the claim endpoint has to be a bad place to guess.
// Per-IP buckets stop the obvious attempt; the global budget is what actually holds when
// someone rotates addresses. Both live in memory — a restart forgives everyone, which is
// an acceptable trade for a single-node app with no shared store.

const IP_MAX_FAILURES = 5;
const IP_WINDOW_MS = 10 * 60 * 1000;
const IP_LOCKOUT_MS = 15 * 60 * 1000;
const IP_BUCKET_LIMIT = 5_000;

const GLOBAL_MAX_FAILURES = 100;
const GLOBAL_WINDOW_MS = 60 * 60 * 1000;

const failures = new Map<string, { count: number; since: number; until: number }>();
let globalFailures = { count: 0, since: 0 };

export type ThrottleVerdict = { ok: true } | { ok: false; retryAfterMinutes: number };

export function checkPairingAttempt(ip: string): ThrottleVerdict {
    const now = Date.now();

    if (globalFailures.since > now - GLOBAL_WINDOW_MS && globalFailures.count >= GLOBAL_MAX_FAILURES) {
        return { ok: false, retryAfterMinutes: minutesUntil(globalFailures.since + GLOBAL_WINDOW_MS, now) };
    }

    const bucket = failures.get(ip);
    if (bucket && bucket.until > now) {
        return { ok: false, retryAfterMinutes: minutesUntil(bucket.until, now) };
    }

    return { ok: true };
}

export function recordPairingFailure(ip: string): void {
    const now = Date.now();

    if (globalFailures.since <= now - GLOBAL_WINDOW_MS) {
        globalFailures = { count: 0, since: now };
    }
    globalFailures.count++;
    if (globalFailures.count === GLOBAL_MAX_FAILURES) {
        console.error('pairing: global failed-attempt budget spent — codes are being guessed');
    }

    const bucket = failures.get(ip);
    if (!bucket || bucket.since <= now - IP_WINDOW_MS) {
        pruneFailures(now);
        failures.set(ip, { count: 1, since: now, until: 0 });
        return;
    }

    bucket.count++;
    if (bucket.count >= IP_MAX_FAILURES) {
        bucket.until = now + IP_LOCKOUT_MS;
        bucket.count = 0;
        bucket.since = now;
    }
}

export function clearPairingFailures(ip: string): void {
    failures.delete(ip);
}

function isRejectedWrite(err: unknown): boolean {
    if (!(err instanceof ClientResponseError) || err.status !== 400) return false;

    const fields = (err.data?.data ?? {}) as Record<string, unknown>;
    const names = Object.keys(fields);

    return names.length === 0 || names.includes('code');
}

/** Four uniformly random digits. `randomInt` keeps 0000 as likely as any other code. */
function generateCode(): string {
    return randomInt(0, 10_000).toString().padStart(4, '0');
}

function minutesUntil(at: number, now: number): number {
    return Math.max(1, Math.ceil((at - now) / 60_000));
}

/** Lazy, so a spoofed forwarded-for header cannot grow the map without bound. */
function pruneFailures(now: number): void {
    for (const [ip, bucket] of failures) {
        if (bucket.until <= now && bucket.since <= now - IP_WINDOW_MS) failures.delete(ip);
    }

    if (failures.size < IP_BUCKET_LIMIT) return;

    for (const ip of [...failures.keys()].slice(0, failures.size - IP_BUCKET_LIMIT + 1)) {
        failures.delete(ip);
    }
}
