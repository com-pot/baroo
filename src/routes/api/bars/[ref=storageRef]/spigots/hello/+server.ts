import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireStation } from '$lib/spigots/spigotAuth.server';
import { listenerCount, touchStation } from '$lib/spigots/spigotHub.server';
import { screenPath } from '$lib/spigots/spigotScreens.server';
import { spigotHelloSchema } from '$lib/spigots/spigotEvents';

/**
 * A station's heartbeat, every 30 s and once at boot. It carries the drink the station
 * remembers, so a venue server that restarted knows the roster again within one beat,
 * and it hands back the station's idle screen.
 */
export const POST: RequestHandler = async (event) => {
    requireStation(event);

    const body = spigotHelloSchema.safeParse(await event.request.json().catch(() => null));
    if (!body.success) error(400, 'expected { spigot, beverage? }');

    const { spigot } = body.data;
    const beverage = body.data.beverage || undefined;
    touchStation(event.params.ref, spigot, beverage ?? null);

    return json({
        ok: true,
        listeners: listenerCount(event.params.ref),
        idle: screenPath(event.params.ref, { view: 'idle', spigot, beverage }),
    });
};
