import { produce } from 'sveltekit-sse'
import { NFC } from 'nfc-pcsc';
import type { RequestHandler } from './$types';

let totalConnects = 0
let totalevents = 0
const listeners: ScannerListener[] = []
const emitMessage = (message: string) => {
    for (const listener of listeners) {
        console.log("emit", listener, message)
        listener.emit(message)
    }
}
const nfc = new NFC();
nfc.on('reader', reader => {
    console.log("Reader ready:")
    emitMessage(`reader-detected:${reader.reader.name}`)

    reader.on('card', card => {
        const eventId = ++totalevents
        console.log(`Card detected ${eventId}`, card);
        emitMessage(`card:${card.uid}`)

        setTimeout(() => {
            emitMessage(`card-removed:${card.uid}`)
        }, 50)
    });
    reader.on('error', err => {
        emitMessage(`reader-error:${err.message}`)
        console.error(`Error(${reader.reader.name}):`, err);
    });
});
export const POST: RequestHandler = ({ request, url }) => {
    const listener = new ScannerListener(++totalConnects, url.searchParams.get('ref') || "")
    listeners.push(listener)

    const unregisterListener = () => {
        const i = listeners.indexOf(listener)
        if (i === -1) {
            console.error("Could not unregister client", listener)
            return
        }
        listeners.splice(i, 1)
    }

    return produce(function start({ emit, lock }) {
        listener.emit = (message: string) => emit('message', message)
        emit('message', listener.format('baroo-scanner-hello', {
            type: 'baroo-scanner-hello',
            activeListeners: listeners.length,
        }))
    }, {
        ping: 10_000,
        stop() {
            console.log("Client disconnected", listener)
            unregisterListener()
        },
    })
}

class ScannerListener {

    public emit: (message: string) => void = () => {};

    constructor(
        private id: number,
        private ref: string,
    ) {

    }

    public format(type: string, data: Record<string, unknown> = {}): string {
        return JSON.stringify({ type, ...data, id: this.id, ref: this.ref })
    }
}
