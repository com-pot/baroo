import {env} from "$env/dynamic/private";
import { produce } from 'sveltekit-sse'

import type { RequestHandler } from './$types';
import { getScannerStructure } from './scanner.server';
import { error } from "@sveltejs/kit";

export const POST: RequestHandler = async ({ request, url }) => {
    if (!env.USE_CARD_SSE) {
        return error(503, 'SSE scanner not enabled');
    }

    const scannerStructure = await getScannerStructure()

    const { listener, destroy: unregisterListener } = scannerStructure.createListener(url.searchParams.get('ref') || "")

    return produce(function start({ emit, lock }) {
        listener.emit = (message: string) => emit('message', message)
        emit('message', listener.format('baroo-scanner-hello', {
            type: 'baroo-scanner-hello',
            activeListeners: scannerStructure.listeners.length,
        }))

        // Catch the new client up on readers found before it connected. Only the
        // ones still answering: a reader the watchdog has given up on must not
        // greet a fresh kiosk as ready to scan.
        for (const entry of scannerStructure.readers.values()) {
            emit('message', entry.healthy
                ? `reader-detected:${entry.name}`
                : `reader-unhealthy:${entry.name} stopped polling`)
        }
    }, {
        ping: 10_000,
        stop() {
            console.log("Client disconnected", listener)
            unregisterListener()
        },
    })
}
