

export async function createScannerStructure() {
    const { NFC } = await import('nfc-pcsc');
    const struct = {
        totalConnects: 0,
        totalevents: 0,
        listeners: [] as ScannerListener[],
        emitMessage(message: string) {
            for (const listener of this.listeners) {
                console.log("emit", listener, message)
                listener.emit(message)
            }
        },

        createListener(ref: string) {
            const listener = new ScannerListener(++this.totalConnects, ref)
            this.listeners.push(listener)

            const destroy = () => {
                const i = this.listeners.indexOf(listener)
                if (i === -1) {
                    console.error("Could not unregister client", listener)
                    return
                }
                this.listeners.splice(i, 1)
            }

            return { listener, destroy }
        }
    }

    const nfc = new NFC();
    nfc.on('reader', reader => {
        console.log("Reader ready:")
        struct.emitMessage(`reader-detected:${reader.reader.name}`)

        reader.on('card', card => {
            const eventId = ++struct.totalevents
            console.log(`Card detected ${eventId}`, card);
            struct.emitMessage(`card:${card.uid}`)

            setTimeout(() => {
                struct.emitMessage(`card-removed:${card.uid}`)
            }, 50)
        });
        reader.on('error', err => {
            struct.emitMessage(`reader-error:${err.message}`)
            console.error(`Error(${reader.reader.name}):`, err);
        });
    });

    return struct
}

export class ScannerListener {

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
