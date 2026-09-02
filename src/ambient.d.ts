
// Web NFC API declarations
declare interface NDEFScanOptions {
    signal?: AbortSignal;
}

declare interface NDEFRecord {
    recordType: string;
    mediaType?: string;
    id?: string;
    data?: BufferSource;
    encoding?: string;
    lang?: string;
}

declare interface NDEFMessage {
    records: readonly NDEFRecord[];
}

declare interface NDEFReadingEvent extends Event {
    serialNumber: string;
    message: NDEFMessage;
}

declare interface NDEFWriteOptions {
    overwrite?: boolean;
    signal?: AbortSignal;
}

declare interface NDEFReader extends EventTarget {
    scan(options?: NDEFScanOptions): Promise<void>;
    write(message: NDEFMessage | string, options?: NDEFWriteOptions): Promise<void>;
    
    onreading: ((this: NDEFReader, ev: NDEFReadingEvent) => any) | null;
    onreadingerror: ((this: NDEFReader, ev: Event) => any) | null;
    
    addEventListener(type: "reading", listener: (ev: NDEFReadingEvent) => void): void;
    addEventListener(type: "readingerror", listener: (ev: Event) => void): void;
    addEventListener(type: string, listener: EventListener): void;
    
    removeEventListener(type: "reading", listener: (ev: NDEFReadingEvent) => void): void;
    removeEventListener(type: "readingerror", listener: (ev: Event) => void): void;
    removeEventListener(type: string, listener: EventListener): void;
}

declare var NDEFReader: {
    prototype: NDEFReader;
    new(): NDEFReader;
};

// nfc-pcsc ships no types. Only the surface the scanner SSE route touches.
declare module 'nfc-pcsc' {
    import type { EventEmitter } from 'node:events';

    export const CONNECT_MODE_CARD: string;
    export const CONNECT_MODE_DIRECT: string;

    export interface Card {
        uid?: string;
        atr?: Buffer;
        standard?: string;
        type?: string;
    }

    export class Reader extends EventEmitter {
        readonly reader: { name: string };
        /** Set while a card sits on the antenna, cleared when it leaves. */
        card: Card | null;
        /** Truthy between a successful `connect()` and its `disconnect()`. */
        connection: unknown;
        autoProcessing: boolean;
        get name(): string;
        connect(mode?: string): Promise<unknown>;
        disconnect(): Promise<void>;
        transmit(data: Buffer, responseMaxLength: number): Promise<Buffer>;
        control(data: Buffer, responseMaxLength: number): Promise<Buffer>;
    }

    export class NFC extends EventEmitter {
        constructor(logger?: unknown);
        get readers(): Record<string, unknown>;
        close(): void;
    }
}
