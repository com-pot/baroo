import { error } from '@sveltejs/kit';
import { produce } from 'sveltekit-sse';
import type { RequestHandler } from './$types';
import { spigotsEnabled, verifySpigotTicket } from '$lib/spigots/spigotAuth.server';
import { rosterEvent, subscribe } from '$lib/spigots/spigotHub.server';
import { SPIGOT_TICKET_HEADER, type SpigotEvent } from '$lib/spigots/spigotEvents';

/**
 * Kiosk's stream of spigot events, authenticated by the spigot ticket
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

        send(rosterEvent(barSlug));

        unsubscribe = subscribe(barSlug, (event) => {
            const { error: failed } = send(event);
            if (!failed) return;

            // Thrown so the hub doesn't count the dead stream as delivered
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
