/**
 * MicroPython's REPL over Web Serial - the raw one as mpremote speaks it, enough to write
 * files and restart the board, and the console a person reads in between.
 *
 * @see https://docs.micropython.org/en/latest/reference/repl.html#raw-mode-and-raw-paste-mode
 */

const RAW_REPL_BANNER = 'raw REPL; CTRL-B to exit\r\n';
/** Like mpremote, so a slow board keeps up with the input */
const INPUT_CHUNK = 256;
const INPUT_CHUNK_PAUSE_MS = 10;
/** Raw bytes per write - its base64 stays a few kB of input */
const FILE_CHUNK = 1536;
/** Under the RP2040's 8.3 s maximum */
const WATCHDOG_MS = 8_000;
/** Of what came and nobody read - the console only listens */
const RECEIVED_LIMIT = 64_000;

export type ReplErrorCode = 'busy' | 'disconnected' | 'timeout' | 'exec';

export class ReplError extends Error {
    constructor(public readonly code: ReplErrorCode, public readonly detail = '') {
        super(detail ? `${code}: ${detail}` : code);
    }
}

export type ReplOptions = {
    /** What the board prints outside the raw REPL - its program's log, the REPL itself */
    onOutput?: (text: string) => void;
};

export class MicroPythonRepl {
    #port: SerialPort;
    #reader: ReadableStreamDefaultReader<Uint8Array>;
    #writer: WritableStreamDefaultWriter<Uint8Array>;
    #encoder = new TextEncoder();

    /** What came from the board and nobody read yet */
    #received = '';
    #wake: (() => void) | null = null;
    #disconnected = false;
    #onOutput: ReplOptions["onOutput"];
    /** Quiet for `onOutput` meanwhile, it's the protocol talking */
    #raw = false;

    #watchdog = false;

    /** Settles once the board is gone, unplugged, reset or closed */
    readonly closed: Promise<void>;

    private constructor(port: SerialPort, options: ReplOptions) {
        this.#port = port;
        this.#onOutput = options.onOutput;
        this.#reader = port.readable!.getReader();
        this.#writer = port.writable!.getWriter();
        this.closed = this.#pump();
    }

    get port(): SerialPort {
        return this.#port;
    }

    static async open(port: SerialPort, options: ReplOptions = {}): Promise<MicroPythonRepl> {
        try {
            // USB CDC ignores the rate
            await port.open({ baudRate: 115200 });
        } catch (err) {
            throw new ReplError('busy', err instanceof Error ? err.message : String(err));
        }

        return new MicroPythonRepl(port, options);
    }

    /** As typed - for the console */
    send(text: string): Promise<void> {
        return this.#write(text);
    }

    /**
     * Stops whatever runs and soft resets into the raw REPL - main.py doesn't run there,
     * and its memory is free again. Without the reset, what the program left - its wifi
     * connection, its modules - is still there to look at.
     */
    async enterRawRepl({ softReset = true } = {}): Promise<void> {
        await this.#write('\r\x03\x03');
        await sleep(100);
        this.#received = '';

        this.#raw = true;
        await this.#write('\r\x01');
        if (softReset) {
            await this.#readUntil(RAW_REPL_BANNER + '>');
            await this.#write('\x04');
            await this.#readUntil('soft reboot\r\n');
        }
        await this.#readUntil(RAW_REPL_BANNER);
    }

    /**
     * Keeps the watchdog from rebooting the board while it's here - one that a program
     * started can't be stopped, and outlives the soft reset. Starts one if none ran, so the
     * session should end with `hardReset()`.
     */
    async holdWatchdog(): Promise<void> {
        await this.exec(`import machine\n_wdt = machine.WDT(timeout=${WATCHDOG_MS})`);
        this.#watchdog = true;
    }

    /** Runs the code, replying with what it printed */
    async exec(code: string, timeoutMs = 10_000): Promise<string> {
        if (this.#watchdog) code = `_wdt.feed()\n${code}`;

        await this.#readUntil('>');
        const input = this.#encoder.encode(code);
        for (let at = 0; at < input.length; at += INPUT_CHUNK) {
            await this.#writer.write(input.subarray(at, at + INPUT_CHUNK));
            await sleep(INPUT_CHUNK_PAUSE_MS);
        }
        await this.#write('\x04');

        await this.#readUntil('OK');
        const output = await this.#readUntil('\x04', timeoutMs);
        const error = await this.#readUntil('\x04', timeoutMs);
        if (error) throw new ReplError('exec', error.trim());

        return output;
    }

    /** Whether the files are on the board, by their path */
    async exists(paths: string[]): Promise<Record<string, boolean>> {
        const output = await this.exec([
            'import os, json',
            'def _exists(path):',
            '    try:',
            '        os.stat(path)',
            '        return True',
            '    except OSError:',
            '        return False',
            `print(json.dumps({path: _exists(path) for path in ${JSON.stringify(paths)}}))`,
        ].join('\n'));

        return JSON.parse(output);
    }

    /** Writes it aside first, so a broken connection leaves the old file as it was */
    async writeFile(path: string, content: string): Promise<void> {
        const part = `${path}.part`;
        const bytes = this.#encoder.encode(content);

        await this.exec(`import binascii, os\n_file = open(${JSON.stringify(part)}, 'wb')`);
        for (let at = 0; at < bytes.length; at += FILE_CHUNK) {
            const chunk = bytes.subarray(at, at + FILE_CHUNK);
            await this.exec(`_file.write(binascii.a2b_base64('${btoa(String.fromCharCode(...chunk))}'))`);
        }
        await this.exec([
            '_file.close()',
            'try:',
            `    os.remove(${JSON.stringify(path)})`,
            'except OSError:',
            '    pass',
            `os.rename(${JSON.stringify(part)}, ${JSON.stringify(path)})`,
        ].join('\n'));
    }

    /** Back to the REPL a person types into */
    async exitRawRepl(): Promise<void> {
        await this.#write('\r\x02');
        this.#raw = false;
    }

    /** Restarts the board for good, from whatever it was doing - the port goes away with it */
    async hardReset(): Promise<void> {
        await this.#write('\r\x03\x03');
        await sleep(100);
        this.#received = '';

        this.#raw = true;
        await this.#write('\r\x01');
        await this.#readUntil(RAW_REPL_BANNER + '>');
        await this.#write('import machine\nmachine.reset()\x04');
        await this.#readUntil('OK').catch(() => {});
        this.#watchdog = false;
        this.#raw = false;
    }

    async close(): Promise<void> {
        await this.#reader.cancel().catch(() => {});
        await this.closed;
        this.#reader.releaseLock();
        this.#writer.releaseLock();
        await this.#port.close().catch(() => {});
    }

    async #pump(): Promise<void> {
        const decoder = new TextDecoder();
        try {
            while (true) {
                const { value, done } = await this.#reader.read();
                if (done) break;
                const text = decoder.decode(value, { stream: true });
                if (!this.#raw) this.#onOutput?.(text);
                this.#received = (this.#received + text).slice(-RECEIVED_LIMIT);
                this.#wake?.();
            }
        } catch {
            // The board went away, the reads below say so
        } finally {
            this.#disconnected = true;
            this.#wake?.();
        }
    }

    #write(text: string): Promise<void> {
        return this.#writer.write(this.#encoder.encode(text)).catch((err: unknown) => {
            throw new ReplError('disconnected', err instanceof Error ? err.message : String(err));
        });
    }

    /** What came before the marker, both dropped from what was received */
    async #readUntil(marker: string, timeoutMs = 5_000): Promise<string> {
        const deadline = Date.now() + timeoutMs;

        while (true) {
            const at = this.#received.indexOf(marker);
            if (at !== -1) {
                const before = this.#received.slice(0, at);
                this.#received = this.#received.slice(at + marker.length);
                return before;
            }

            if (this.#disconnected) throw new ReplError('disconnected');
            const left = deadline - Date.now();
            if (left <= 0) throw new ReplError('timeout', this.#received.slice(-200));

            await new Promise<void>((resolve) => {
                const timer = setTimeout(resolve, left);
                this.#wake = () => {
                    clearTimeout(timer);
                    resolve();
                };
            });
            this.#wake = null;
        }
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
