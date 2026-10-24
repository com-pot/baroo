import { error } from '@sveltejs/kit';
import { produce } from 'sveltekit-sse';
import type { RequestHandler } from './$types';
import { spigotsEnabled, verifySpigotTicket } from '$lib/spigots/spigotAuth.server';
import { rosterEvent, subscribe } from '$lib/spigots/spigotHub.server';
import { SPIGOT_TICKET_HEADER, type SpigotEvent } from '$lib/spigots/spigotEvents';

/**
 * The kiosk's end of the spigot stations: pours, drink changes and the station roster,
 * as they happen. Proved by the spigot ticket rather than the device token, because
 * checking the token needs PocketBase — see `spigotAuth.server.ts`.
 */
export const POST: RequestHandler = async ({ request, params }) => {
    if (!spigotsEnabled()) error(503, 'spigots-disabled');

    const barSlug = params.ref;
    if (!verifySpigotTicket(request.headers.get(SPIGOT_TICKET_HEADER), barSlug)) {
        error(401, 'spigot-ticket-invalid');
    }

    let unsubscribe = () => {};

    return produce(function start({ emit }) {
        const send = (event: SpigotEvent) => emit('message', JSON.stringify(event));

        // The roster first, so a kiosk that just (re)connected shows the stations at once
        // instead of waiting out their next heartbeat.
        send(rosterEvent(barSlug));

        unsubscribe = subscribe(barSlug, (event) => {
            const { error: failed } = send(event);
            if (!failed) return;

            // The stream is gone, whether or not `stop` has heard yet. Thrown so the hub
            // does not count it — the station would signal "poured" for nobody.
            unsubscribe();
            throw failed;
        });
    }, {
        ping: 10_000,
        stop() {
            unsubscribe();
        },
    });
};
