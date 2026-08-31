import { error, type RequestEvent } from '@sveltejs/kit';
import { createDb, type Db } from '$lib/db.server';
import { DEVICE_ID_HEADER, type PosDevice } from './device';

export type { PosDevice, PosDeviceKind } from './device';

/**
 * Identifies the enrolled tablet behind a request and hands back a PocketBase client
 * acting as the barman who enrolled it.
 *
 * Two things have to line up: the bearer token must still be valid (PocketBase decides
 * that, in `createDb`), and the `pos_devices` record it names must be active and belong
 * to the bar in the URL. A tablet cannot reach another bar's data by editing the path.
 *
 * The returned `token` is freshly refreshed — always send it back to the device so a
 * tablet that keeps checking in never has its token lapse underground.
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

    // Throws 401/403 upward if PocketBase rejects the token.
    const pb = await createDb({ token });

    const device = await pb.collection<PosDevice>('pos_devices').getOne(deviceId, {
        expand: 'bar',
    })
        .catch(() => { throw error(401, 'device-unknown') })

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

    return { device, pb, token: pb.authStore.token };
}
