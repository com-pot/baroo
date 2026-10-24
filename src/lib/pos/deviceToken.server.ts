import { ClientResponseError, getTokenPayload, isTokenExpired } from 'pocketbase';
import { createDb, superuserDb, superuserStatus } from '$lib/db.server';

/**
 * How long a freshly minted tablet token lives. A tablet that reaches the server at
 * least once inside this window never needs re-pairing; one that goes dark for longer
 * does, because an expired token is nothing we can verify or renew.
 */
export const DEVICE_TOKEN_TTL_S = 30 * 24 * 60 * 60;

/** Re-mint once this little life is left, so a tablet syncing weekly stays ahead of it. */
const REMINT_WITHIN_S = 7 * 24 * 60 * 60;

/** Long enough that a snapshot-then-sync pair mints once, short enough to be forgettable. */
const MINT_CACHE_MS = 60_000;

const mintCache = new Map<string, { token: string; at: number }>();
const warned = new Set<string>();

/**
 * A token for a tablet acting as `userId`.
 *
 * PocketBase only lets a superuser do this, and the token it hands back is *not*
 * refreshable — the tablet can never renew it itself, which is why the server re-mints
 * proactively in `ensureDeviceToken`.
 */
export async function mintDeviceToken(userId: string): Promise<string> {
    try {
        return await impersonate(userId, DEVICE_TOKEN_TTL_S);
    } catch (err) {
        if (err instanceof ClientResponseError && err.status === 400) {
            // Some PocketBase builds cap how long an impersonated token may live. Take
            // the collection default rather than refuse to pair.
            return impersonate(userId, 0);
        }
        throw err;
    }
}

/**
 * The token to hand back to a tablet: the one it presented while that still has life in
 * it, a freshly minted one when it hasn't.
 *
 * Never throws. A tablet whose token cannot be renewed keeps working on the one it has
 * until it expires — breaking a working kiosk over a failed rotation would be worse than
 * the lapse it is trying to prevent.
 */
export async function ensureDeviceToken(device: {
    token: string;
    deviceId: string;
    enrolledBy?: string;
}): Promise<string> {
    const { token, deviceId, enrolledBy } = device;

    if (!isTokenExpired(token, REMINT_WITHIN_S)) return token;

    const cached = mintCache.get(deviceId);
    if (cached && cached.at > Date.now() - MINT_CACHE_MS) return cached.token;

    let fresh: string | null = null;

    if (enrolledBy && superuserStatus() === 'ready') {
        fresh = await mintDeviceToken(enrolledBy).catch(err => {
            warnOnce(deviceId, `could not mint a device token: ${message(err)}`);
            return null;
        });
    }

    // A token from the old login-based enrolment is refreshable, so it can still rotate
    // itself. That keeps tablets enrolled before pairing existed alive even on a server
    // with no superuser configured.
    if (!fresh && getTokenPayload(token).refreshable) {
        fresh = await createDb({ token })
            .then(pb => pb.authStore.token)
            .catch(err => {
                warnOnce(deviceId, `could not refresh a legacy device token: ${message(err)}`);
                return null;
            });
    }

    if (!fresh) return token;

    pruneMintCache();
    mintCache.set(deviceId, { token: fresh, at: Date.now() });

    return fresh;
}

/**
 * The pairing credential is a static token, so there is nothing to retry with: a 401 here
 * means `PB_SU_TOKEN` has been revoked and someone has to paste a new one.
 */
async function impersonate(userId: string, duration: number): Promise<string> {
    const su = await superuserDb();
    if (!su) throw new Error('superuser-unavailable');

    return (await su.collection('users').impersonate(userId, duration)).authStore.token;
}

function warnOnce(deviceId: string, what: string): void {
    if (warned.has(deviceId)) return;
    warned.add(deviceId);
    console.warn(`device ${deviceId}: ${what}`);
}

function message(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

function pruneMintCache(): void {
    const stale = Date.now() - MINT_CACHE_MS;
    for (const [deviceId, entry] of mintCache) {
        if (entry.at <= stale) mintCache.delete(deviceId);
    }
}
