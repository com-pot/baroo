
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


// Web Serial API declarations
declare interface SerialPortInfo {
    usbVendorId?: number;
    usbProductId?: number;
}

declare interface SerialPortFilter {
    usbVendorId?: number;
    usbProductId?: number;
}

declare interface SerialPort extends EventTarget {
    readonly readable: ReadableStream<Uint8Array> | null;
    readonly writable: WritableStream<Uint8Array> | null;

    open(options: { baudRate: number }): Promise<void>;
    close(): Promise<void>;
    getInfo(): SerialPortInfo;
}

declare interface Serial extends EventTarget {
    getPorts(): Promise<SerialPort[]>;
    requestPort(options?: { filters?: SerialPortFilter[] }): Promise<SerialPort>;
}

declare interface Navigator {
    /** Missing outside Chromium */
    readonly serial?: Serial;
}
