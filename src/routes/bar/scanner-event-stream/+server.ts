import {env} from "$env/dynamic/private";
import { produce } from 'sveltekit-sse'

import type { RequestHandler } from './$types';
import { createScannerStructure } from './scanner.server';
import { error } from "@sveltejs/kit";

let scannerStructure: null | Awaited<ReturnType<typeof createScannerStructure>> = null

export const POST: RequestHandler = async ({ request, url }) => {
    if (!env.USE_CARD_SSE) {
        return error(503, 'SSE scanner not enabled');
    }

    if (!scannerStructure) {
        scannerStructure = await createScannerStructure()
    }

    const { listener, destroy: unregisterListener } = scannerStructure.createListener(url.searchParams.get('ref') || "")

    return produce(function start({ emit, lock }) {
        listener.emit = (message: string) => emit('message', message)
        emit('message', listener.format('baroo-scanner-hello', {
            type: 'baroo-scanner-hello',
            activeListeners: scannerStructure!.listeners.length,
        }))

        // Catch the new client up on readers found before it connected.
        for (const name of scannerStructure!.readers) {
            emit('message', `reader-detected:${name}`)
        }
    }, {
        ping: 10_000,
        stop() {
            console.log("Client disconnected", listener)
            unregisterListener()
        },
    })
}
