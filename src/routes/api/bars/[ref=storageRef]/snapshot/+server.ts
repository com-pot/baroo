import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolveDevice } from '$lib/pos/device.server';
import { readPosConfig } from '$lib/pos/device';
import getSnapshot from '$lib/bar/snapshot/getSnapshot';
import { issueTapTicket, tapsEnabled } from '$lib/taps/tapAuth.server';
import { broadcastTaps, learnSnapshot } from '$lib/taps/tapBoard.server';
import { directoryImages, rememberSnapshot } from '$lib/taps/tapDirectory.server';
import { warmImages } from '$lib/taps/tapImages.server';

export const GET: RequestHandler = async ({ params, request, locals }) => {
    const barSlug = params.ref;
    const { pb, token, device } = await resolveDevice(request, barSlug);

    const snapshot = await getSnapshot({ pb }, barSlug)

    // What is on the taps, and what the TapTappers show while PocketBase is unreachable
    void learnSnapshot(locals, barSlug, snapshot)
        .then((changed) => {
            if (changed) return broadcastTaps(locals, barSlug);
        })
        .catch((err) => locals.logger.error(err, '[taps] could not tell what is on the taps'));

    if (tapsEnabled()) {
        void rememberSnapshot(locals, barSlug, snapshot)
            .then(() => directoryImages(locals, barSlug))
            .then((images) => warmImages(locals, images))
            .catch((err) => locals.logger.error(err, '[taps] could not learn the bar'));
    }

    return json({
        snapshot,
        token,
        config: readPosConfig(device.config),
        tapTicket: issueTapTicket(device.id, device.kind, barSlug),
    });
};
