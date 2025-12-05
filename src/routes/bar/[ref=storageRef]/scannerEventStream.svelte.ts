import { source } from "sveltekit-sse";

export class ScannerEventStream {
    public lastMessage = $state("")

    public streamSource: ReturnType<typeof source>
    public stream: ReturnType<ReturnType<typeof source>["select"]>

    constructor(ref: string, private opts: ScannerEventStreamOptions = {}) {
        this.streamSource = source("/bar/scanner-event-stream?" + new URLSearchParams([
            ['ref', ref],
        ]), {
            close: ({ status, connect }) => {
                this.lastMessage = 'connection:closed-by-server'
                if (status >= 400) {
                    return
                }
                connect()
            }
        });

        this.stream = this.streamSource.select("message");
    }

    public init() {
        this.stream.subscribe((message) => {
            if (message === "heartbeat") {
                return;
            }

            this.lastMessage = message;
            this.opts.onMessage?.(message);
        });
    }
}

type ScannerEventStreamOptions = {
    onMessage?: (message: string) => void;
}
