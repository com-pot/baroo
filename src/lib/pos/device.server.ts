import { error, type RequestEvent } from '@sveltejs/kit';
import { ClientResponseError, isTokenExpired } from 'pocketbase';
import { createTokenDb, type Db } from '$lib/db.server';
import { ensureDeviceToken } from './deviceToken.server';
import { DEVICE_ID_HEADER, type PosDevice } from './device';

export type { PosDevice, PosDeviceKind } from './device';

/** Tolerance for a tablet whose clock drifts from the server's. */
const CLOCK_SKEW_S = 30;

/**
 * Identifies the enrolled tablet behind a request and hands back a PocketBase client
 * acting as the barman it was paired as.
 *
 * Two things have to line up: the bearer token must still be good, and the `pos_devices`
 * record it names must be active and belong to the bar in the URL. A tablet cannot reach
 * another bar's data by editing the path.
 *
 * Validation is the `pos_devices` read itself — PocketBase treats a bad token as an
 * anonymous request, and the collection is barman-only, so a stale token simply cannot
 * see the record. Device tokens are minted by impersonation and are *not* refreshable,
 * hence no `authRefresh` here; `ensureDeviceToken` mints a replacement before the current
 * one lapses, and the returned `token` must always be sent back to the device.
 */
export async function resolveDevice(
    event: RequestEvent,
    barSlug: string,
): Promise<{ device: PosDevice; pb: Db; token: string }> {
    const deviceId = event.request.headers.get(DEVICE_ID_HEADER);
    const authorization = event.request.headers.get('authorization');
    const token = authorization?.replace(/^Bearer /i, '').trim();

    if (!deviceId || !token) {
        error(401, 'device-not-enrolled');
    }

    // Cheap local check: an expired or malformed token costs no round-trip, and the
    // tablet gets a reason it can tell apart from "I don't know this device".
    if (isTokenExpired(token, CLOCK_SKEW_S)) {
        error(401, 'device-token-expired');
    }

    const pb = createTokenDb(token);

    const device = await pb.collection<PosDevice>('pos_devices')
        .getOne(deviceId, { expand: 'bar' })
        .catch((err: unknown) => {
            // Status 0 is no answer at all — PocketBase is down or unreachable. Saying
            // "unknown device" there would tell a tablet its identity is bad when it is
            // the server that is missing.
            if (err instanceof ClientResponseError && err.status === 0) {
                throw error(503, 'pb-unreachable');
            }
            throw error(401, 'device-unknown');
        });

    if (!device.active) {
        error(403, 'device-deactivated');
    }

    if (device.expand?.bar?.slug !== barSlug) {
        error(403, 'device-bar-mismatch');
    }

    // Best-effort presence stamp; never let it fail the request it is decorating.
    pb.collection('pos_devices')
        .update(device.id, { lastSeen: new Date().toISOString() })
        .catch(() => {});

    event.locals.device = device;

    return {
        device,
        pb,
        token: await ensureDeviceToken({ token, deviceId: device.id, enrolledBy: device.enrolledBy }),
    };
}
