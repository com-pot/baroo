import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolveDevice } from '$lib/pos/device.server';
import { readPosConfig } from '$lib/pos/device';
import getSnapshot from '$lib/bar/snapshot/getSnapshot';
import { issueSpigotTicket, spigotsEnabled } from '$lib/spigots/spigotAuth.server';
import { directoryImages, rememberSnapshot } from '$lib/spigots/spigotDirectory.server';
import { warmImages } from '$lib/spigots/spigotImages.server';

export const GET: RequestHandler = async ({ params, request, locals }) => {
    const barSlug = params.ref;
    const { pb, token, device } = await resolveDevice(request, barSlug);

    const snapshot = await getSnapshot({ pb }, barSlug)

    // Spigot stations must know drinks, cards and pictures while PocketBase is unreachable
    if (spigotsEnabled()) {
        void rememberSnapshot(locals, barSlug, snapshot)
            .then(() => directoryImages(locals, barSlug))
            .then((images) => warmImages(locals, images))
            .catch((err) => locals.logger.error(err, '[spigots] could not learn the bar'));
    }

    return json({
        snapshot,
        token,
        config: readPosConfig(device.config),
        spigotTicket: issueSpigotTicket(device.id, barSlug),
    });
};
