import { env } from '$env/dynamic/private';
import { error, type RequestEvent } from '@sveltejs/kit';
import { ClientResponseError } from 'pocketbase';
import { createTokenDb, type Db } from '$lib/db.server';
import { resolveDevice } from '$lib/pos/device.server';
import type { PosDeviceKind } from '$lib/pos/device';
import type { Bar } from '$lib/bar/BarModel';
import { tapRef } from './barTap';

/**
 * Taps are online-only: a tap presents the token it got when its config was authorized,
 * and acts in PocketBase as itself. Kiosks present their device token.
 */

/** What PocketBase tells a tap about itself */
export type TapIdentity = {
    id: string;
    sequence: number;
    name: string;
    model: string;
    config: unknown;
    /** Key of the offer item on tap */
    nowServing: string | null;
    bar: Pick<Bar, 'id' | 'slug' | 'name'>;
};

export type TapSession = {
    /** Acting as the tap */
    pb: Db;
    tap: TapIdentity;
    /** How events and kiosks refer to the tap */
    ref: string;
};

/** The tap behind a request, marked as seen */
export async function requireTap(event: RequestEvent): Promise<TapSession> {
    const pb = await Promise.resolve()
        .then(() => createTokenDb(env, bearer(event)))
        .catch((err) => {
            event.locals.logger.error(err)
            return error(401, 'tap-not-authorized')
        });

    const tap = await pb.send<TapIdentity>('/api/baroo/tap/hello', { method: 'POST' })
        .catch((err: unknown) => {
            if (!(err instanceof ClientResponseError) || err.status === 0) error(503, 'pb-unreachable');
            error(err.status === 403 ? 403 : 401, 'tap-not-authorized');
        });

    if (tap.bar.slug !== event.params.ref) error(403, 'tap-bar-mismatch');

    return { pb, tap, ref: tapRef(tap) };
}

/** The kiosk behind a request, by its device token */
export async function requireTapKiosk(event: RequestEvent): Promise<{ deviceId: string; kind: PosDeviceKind; pb: Db }> {
    const { device, pb } = await resolveDevice(event.request, event.params.ref ?? '');
    return { deviceId: device.id, kind: device.kind, pb };
}

/** Kiosks by their device token, backstage by the bar manager's session */
export async function tapListener(event: RequestEvent): Promise<{ pb: Db } | null> {
    if (bearer(event)) {
        const kiosk = await requireTapKiosk(event);
        return { pb: kiosk.pb };
    }

    return event.locals.acl.hasRole('bar-manager') ? { pb: event.locals.pb } : null;
}

function bearer(event: RequestEvent): string | undefined {
    return event.request.headers.get('authorization')?.replace(/^Bearer /i, '').trim() || undefined;
}
