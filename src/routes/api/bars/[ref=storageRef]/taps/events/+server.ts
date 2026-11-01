import { error } from '@sveltejs/kit';
import { produce } from 'sveltekit-sse';
import type { RequestHandler } from './$types';
import { tapListenerRole, tapsEnabled } from '$lib/taps/tapAuth.server';
import { tapStates } from '$lib/taps/tapBoard.server';
import { subscribe } from '$lib/taps/tapHub.server';
import type { TapEvent } from '$lib/taps/tapEvents';

/**
 * Stream of tap events, for kiosks by their tap ticket and for backstage by the bar manager's session
 */
export const POST: RequestHandler = async (event) => {
    if (!tapsEnabled()) error(503, 'taps-disabled');

    const role = tapListenerRole(event);
    if (!role) error(401, 'tap-ticket-invalid');

    const barSlug = event.params.ref;
    const taps = await tapStates(event.locals, barSlug);

    let unsubscribe = () => {};

    return produce(function start({ emit }) {
        const send = (tapEvent: TapEvent) => emit('message', JSON.stringify(tapEvent));

        send({ type: 'taps', taps, at: new Date().toISOString() });

        unsubscribe = subscribe(barSlug, role, (tapEvent) => {
            const { error: failed } = send(tapEvent);
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
