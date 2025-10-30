
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

