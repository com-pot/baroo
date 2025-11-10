import { produce } from 'sveltekit-sse'
import { NFC } from 'nfc-pcsc';

const listeners: ((message: string) => void)[] = []
const emitMessage = (message: string) => {
    for (const listener of listeners) {
        listener(message)
    }
}
const nfc = new NFC();
nfc.on('reader', reader => {
    console.log("Reader ready:")
    emitMessage(`reader-detected:${reader.reader.name}`)

    reader.on('card', card => {
        emitMessage(`card:${card.uid}`)
        console.log(`Card detected`, card);
    });
    reader.on('error', err => {
        emitMessage(`reader-error:${err.message}`)
        console.error(`Error(${reader.reader.name}):`, err);
    });
});
export function POST() {
    return produce(function start({ emit, lock }) {
        const listener = (message: string) => emit('message', message)
        listeners.push(listener)
        emit('message', 'initializing-nfc')

        function close(reason: unknown) {
            if (reason instanceof Error && reason.message.startsWith('Client disconnected')) {
                // do nothing
            } else {
                console.log("close sse", reason)
            }
        }
    }, {
        ping: 10_000,
        stop() {
            console.log("Client disconnected")
        }
    })
}
