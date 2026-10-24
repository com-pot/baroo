import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireStation } from '$lib/spigots/spigotAuth.server';
import { listenerCount, touchStation } from '$lib/spigots/spigotHub.server';
import { spigotHelloSchema } from '$lib/spigots/spigotEvents';

/**
 * A station's heartbeat, every 30 s and once at boot. It carries the drink the station
 * remembers, so a venue server that restarted knows the roster again within one beat.
 */
export const POST: RequestHandler = async (event) => {
    requireStation(event);

    const body = spigotHelloSchema.safeParse(await event.request.json().catch(() => null));
    if (!body.success) error(400, 'expected { spigot, beverage? }');

    touchStation(event.params.ref, body.data.spigot, body.data.beverage || null);

    return json({ ok: true, listeners: listenerCount(event.params.ref) });
};
