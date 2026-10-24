import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolveDevice } from '$lib/pos/device.server';
import { readPosConfig } from '$lib/pos/device';
import getSnapshot from '$lib/bar/snapshot/getSnapshot';
import { issueSpigotTicket, spigotsEnabled } from '$lib/spigots/spigotAuth.server';
import { rememberOfferItems } from '$lib/spigots/beverageTags.server';

export const GET: RequestHandler = async ({ params, request, locals }) => {
    const barSlug = params.ref;
    const { pb, token, device } = await resolveDevice(request, barSlug);

    const snapshot = await getSnapshot({ pb }, barSlug)

    // Spigot stations must recognize beverage tags while PocketBase is unreachable
    if (spigotsEnabled()) void rememberOfferItems(locals, barSlug, snapshot.offerItems);

    return json({
        snapshot,
        token,
        config: readPosConfig(device.config),
        spigotTicket: issueSpigotTicket(device.id, barSlug),
    });
};
