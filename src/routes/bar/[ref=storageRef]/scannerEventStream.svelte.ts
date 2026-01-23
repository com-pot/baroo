import { source } from "sveltekit-sse";

export class ScannerEventStream {
    public messages = $state([] as string[])
    public lastMessage = $derived.by(() => this.messages[0] || "")

    public streamSource: ReturnType<typeof source>
    public stream: ReturnType<ReturnType<typeof source>["select"]>

    constructor(ref: string, private opts: ScannerEventStreamOptions = {}) {
        this.streamSource = source("/bar/scanner-event-stream?" + new URLSearchParams([
            ['ref', ref],
        ]), {
            close: ({ status, connect }) => {
                this.addMessage('connection:closed-by-server')
                if (status >= 400) {
                    return
                }
                connect()
            }
        });

        this.stream = this.streamSource.select("message");
    }

    public init() {
        return this.stream.subscribe((message) => {
            if (message === "heartbeat") {
                return;
            }

            this.addMessage(message);
            this.lastMessage = message;
        });
    }

    addMessage(message: typeof this["lastMessage"]) {
        this.messages.unshift(message);
        const maxSize = this.opts.historySize || 20;
        if (this.messages.length > maxSize) {
            this.messages.splice(maxSize);
        }
        this.opts.onMessage?.(message);
    }
}

type ScannerEventStreamOptions = {
    onMessage?: (message: string) => void;
    historySize?: number;
}
