import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolveDevice } from '$lib/pos/device.server';
import { readPosConfig } from '$lib/pos/device';
import getSnapshot from '$lib/bar/snapshot/getSnapshot';

export const GET: RequestHandler = async ({ params, request, locals }) => {
    const barSlug = params.ref;
    const { pb, token, device } = await resolveDevice(request, barSlug);

    const snapshot = await getSnapshot({ pb }, barSlug)

    return json({
        snapshot,
        token,
        config: readPosConfig(device.config),
    });
};
