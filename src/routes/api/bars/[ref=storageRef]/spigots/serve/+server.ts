import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { normalizeTag } from '$lib/bar/tags';
import { requireStation } from '$lib/spigots/spigotAuth.server';
import { emit, touchStation } from '$lib/spigots/spigotHub.server';
import { stationScreens } from '$lib/spigots/spigotScreens.server';
import { spigotServeSchema, type SpigotServeResult } from '$lib/spigots/spigotEvents';

/**
 * Serving picked on a station's buttons for the pour of its last scan
 *
 * Kiosks decide whether the pour is still pending. Must work without PocketBase.
 */
export const POST: RequestHandler = async (event) => {
    requireStation(event);

    const { locals } = event;
    const barSlug = event.params.ref;
    const body = spigotServeSchema.safeParse(await event.request.json().catch(() => null));
    if (!body.success) error(400, 'expected { spigot, pour, uid, beverage, size }');

    const { spigot, pour, beverage, size } = body.data;
    touchStation(locals, barSlug, spigot, beverage);

    const delivered = emit(locals, barSlug, {
        type: 'pour-served',
        id: pour,
        spigot,
        variant: size,
        at: new Date().toISOString(),
    });

    return json({
        delivered,
        ...stationScreens(barSlug, spigot, beverage, {
            view: 'served',
            spigot,
            beverage,
            serial: normalizeTag(body.data.uid),
            size,
            warn: delivered ? undefined : 'no-kiosk',
        }),
    } satisfies SpigotServeResult);
};
