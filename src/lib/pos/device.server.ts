import { error, type RequestEvent } from '@sveltejs/kit';
import { ClientResponseError, isTokenExpired } from 'pocketbase';
import { createTokenDb, type Db } from '$lib/db.server';
import { ensureDeviceToken } from './deviceToken.server';
import { DEVICE_ID_HEADER, type PosDevice } from './device';

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

    if (isTokenExpired(token)) {
        error(401, 'device-token-expired');
    }

    const pb = createTokenDb(token);

    const device = await pb.collection<PosDevice>('pos_devices')
        .getOne(deviceId, { expand: 'bar' })
        .catch((err: unknown) => {
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

    pb.collection('pos_devices')
        .update(device.id, { lastSeen: new Date().toISOString() })
        .catch((error) => event.locals.logger.error("device preferences save failed", error));

    event.locals.device = device;

    return {
        device,
        pb,
        token: await ensureDeviceToken({ token, deviceId: device.id, enrolledBy: device.enrolledBy }),
    };
}
