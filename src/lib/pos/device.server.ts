import { env } from '$env/dynamic/private';
import { error, type RequestEvent } from '@sveltejs/kit';
import { ClientResponseError } from 'pocketbase';
import { createTokenDb, type Db } from '$lib/db.server';
import type { Bar } from '$lib/bar/BarModel';
import type { DeviceIdentity } from '$lib/offline/types';
import { isError } from '$lib/errors';

type CheckIn = Pick<DeviceIdentity, 'token' | 'device'> & {
    bar: Pick<Bar, 'id' | 'slug' | 'name'>;
};

/**
 * The pos device behind a request
 */
export async function resolveDevice(
    request: RequestEvent["request"],
    barSlug: string,
): Promise<{ device: CheckIn['device']; pb: Db; token: string }> {
    const pb = await Promise.resolve()
        .then(() => createTokenDb(env, request.headers.get('authorization')?.replace(/^Bearer /i, '').trim()))
        .catch((err) => {
            if (isError(err)) {
                throw error((err.data?.status ?? 401) as number, err.error)
            }

            throw error(500, "pb-unreachable")
        })

    const checkIn = await pb.send<CheckIn>(`/api/baroo/device/check-in`, {
        method: 'POST',
        body: {
            barSlug,
        },
    }).catch((err: unknown) => {
        if (!(err instanceof ClientResponseError) || err.status === 0) {
            throw error(503, 'pb-unreachable');
        }

        const { reason, authorizedBar } = (err.data ?? {}) as { reason?: string; authorizedBar?: string };
        if (err.status === 403 && reason === 'device-bar-mismatch') {
            throw error(403, { message: reason, details: { authorizedBar } });
        }

        throw error(err.status === 403 ? 403 : 401, reason ?? 'device-unknown');
    });

    return {
        device: checkIn.device,
        pb,
        token: checkIn.token,
    };
}
