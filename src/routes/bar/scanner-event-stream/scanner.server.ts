import { env } from "$env/dynamic/private";
import { exec } from "node:child_process";

// Type-only, so this does not pull the native module in on a machine with no PC/SC.
import type { Card, NFC as NfcInstance, Reader as NfcReader } from "nfc-pcsc";

/**
 * The reader wedges.
 *
 * An ACR122U-class device (the Akasa units are rebadged ACS) runs its own card
 * polling loop in firmware and drives its LED from it. After a failed or aborted
 * transaction the PN532 inside can stop polling altogether — dark LED, no card
 * events — while PC/SC still cheerfully lists the reader as present. The
 * documented cure is a re-plug, so most of what follows exists to notice the
 * reader went quiet and then re-plug it in software.
 */

/**
 * How often to ask the PN532 whether it is still alive. 0 disables probing.
 * Parsed defensively: an unset, blank or unparseable value has to land on the
 * default rather than silently switching the watchdog off.
 */
const PROBE_INTERVAL_MS = (() => {
    const raw = env.CARD_READER_PROBE_MS?.trim();
    if (!raw) {
        return 60_000;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
        console.warn(`Ignoring CARD_READER_PROBE_MS="${raw}"; falling back to 60000ms`);
        return 60_000;
    }
    return parsed;
})();
/** One slow probe is not a fault — a USB bus can stall. Two in a row is. */
const PROBE_FAILURES_BEFORE_UNHEALTHY = 2;
const PROBE_TIMEOUT_MS = 3_000;
/** Long enough for the kernel and pcscd to re-enumerate before we hit it again. */
const RESET_COOLDOWN_MS = 60_000;
const RESET_TIMEOUT_MS = 30_000;
/** Rebuilding the PC/SC context: back off so a dead pcscd is not hammered. */
const NFC_RESTART_DELAY_MS = 5_000;

/**
 * PN532 GetFirmwareVersion, wrapped in the ACR122U's Direct Transmit APDU. Read
 * only, and the same handshake libnfc opens the device with — the cheapest
 * question that only a polling chip can answer.
 */
const PROBE_APDU = Buffer.from([0xff, 0x00, 0x00, 0x00, 0x02, 0xd4, 0x02]);
/**
 * The PN532 replies D5 03 <ic> <ver> <rev> <support>. A wedged chip leaves the
 * reader's own MCU to answer for it — 63 00, or nothing at all — so the prefix
 * is the part worth checking, not the status word.
 */
const PROBE_RESPONSE_PREFIX = Buffer.from([0xd5, 0x03]);

type ReaderEntry = {
    name: string;
    reader: NfcReader;
    /**
     * Unknown until the first probe answers. CCID escape commands are refused by
     * pcsc-lite unless the driver is configured to allow them, and a reader PC/SC
     * has only just announced is alive by definition — so a probe that fails on
     * the very first try means probing is unavailable here, not that the reader
     * is dead.
     */
    probeSupported: boolean | null;
    probeFailures: number;
    healthy: boolean;
};

export async function createScannerStructure() {
    const { NFC, CONNECT_MODE_DIRECT } = await import('nfc-pcsc');

    const struct = {
        totalConnects: 0,
        totalevents: 0,
        listeners: [] as ScannerListener[],
        /**
         * Readers are found once, when PC/SC first comes up — long before the kiosk
         * that cares reconnects. Remembering them lets a late client be told the
         * reader is live instead of waiting for an event that already happened.
         * Entries leave on `end`, so a late client is never sold a dead reader.
         */
        readers: new Map<string, ReaderEntry>(),
        emitMessage(message: string) {
            console.log("emit", message);
            for (const listener of this.listeners) {
                try {
                    listener.emit(message);
                } catch (err) {
                    // One client whose stream has died must not swallow the card
                    // event for everyone standing behind it in the list.
                    console.error("Could not emit to client", err);
                }
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
        },

        /**
         * Re-plug the reader without walking over to it. There is no portable way
         * to do this from Node — a USB reset needs privileges we should not hold —
         * so the actual command is the operator's to supply.
         */
        resetReader(reason: string): { started: boolean; detail: string } {
            const command = env.CARD_READER_RESET_CMD;
            if (!command) {
                const detail = "CARD_READER_RESET_CMD is not set; the reader needs a manual re-plug";
                console.warn(`Reader reset wanted (${reason}) but ${detail}`);
                return { started: false, detail };
            }

            const since = Date.now() - lastResetAt;
            if (since < RESET_COOLDOWN_MS) {
                const detail = `reset already attempted ${Math.round(since / 1000)}s ago`;
                console.warn(`Reader reset wanted (${reason}) but ${detail}`);
                return { started: false, detail };
            }

            lastResetAt = Date.now();
            console.warn(`Resetting reader (${reason}):`, command);
            struct.emitMessage(`reader-resetting:${reason}`);

            exec(command, { timeout: RESET_TIMEOUT_MS }, (err, stdout, stderr) => {
                if (err) {
                    console.error("Reader reset failed:", err, stderr);
                    struct.emitMessage(`reader-reset-failed:${err.message}`);
                    return;
                }
                // pcscd re-enumerating the device is what actually brings the reader
                // back: that arrives as `end` then `reader`, not from here.
                console.log("Reader reset command finished", stdout.trim());
            });

            return { started: true, detail: command };
        },
    }

    let lastResetAt = 0;
    let nfc: NfcInstance | null = null;
    let restartTimer: NodeJS.Timeout | null = null;

    /**
     * nfc-pcsc reports a failed `SCardConnect` by calling `emit(err)` — the Error
     * as the *event name* — so a card that taps but will not connect produces no
     * card event, no error event, and nothing in the log. Handing it a logger is
     * the only way to see those: `connect()` records them itself before the
     * broken re-emit. `debug` stays off, or every card-in/card-out fills the log.
     */
    const readerLogger = {
        log: () => {},
        debug: () => {},
        info: () => {},
        warn: (...args: unknown[]) => console.warn("nfc-pcsc:", ...args),
        error: (...args: unknown[]) => console.error("nfc-pcsc:", ...args),
    };

    const markUnhealthy = (entry: ReaderEntry, reason: string) => {
        if (entry.healthy) {
            entry.healthy = false;
            struct.emitMessage(`reader-unhealthy:${reason}`);
        }
        struct.resetReader(reason);
    };

    const markHealthy = (entry: ReaderEntry) => {
        entry.probeFailures = 0;
        if (!entry.healthy) {
            entry.healthy = true;
            struct.emitMessage(`reader-detected:${entry.name}`);
        }
    };

    /**
     * Talking to the PN532 needs the reader connected in DIRECT mode, which
     * collides with the shared connection the card path uses. Skipping while a
     * card is present keeps them apart; the few milliseconds either side are a
     * risk the probe interval makes negligible, and the cost of losing that race
     * is one re-tap.
     */
    const probe = async (entry: ReaderEntry) => {
        if (entry.reader.card) {
            return;
        }

        let response: Buffer;
        try {
            await entry.reader.connect(CONNECT_MODE_DIRECT);
            response = await withTimeout(
                entry.reader.control(PROBE_APDU, 16),
                PROBE_TIMEOUT_MS,
                "PN532 did not answer",
            );
        } catch (err) {
            recordProbeFailure(entry, err instanceof Error ? err.message : String(err));
            return;
        } finally {
            try {
                if (entry.reader.connection) {
                    await entry.reader.disconnect();
                }
            } catch (err) {
                console.error(`Could not release direct connection(${entry.name}):`, err);
            }
        }

        if (!response.subarray(0, 2).equals(PROBE_RESPONSE_PREFIX)) {
            recordProbeFailure(entry, `unexpected answer ${response.toString('hex')}`);
            return;
        }

        entry.probeSupported = true;
        markHealthy(entry);
    };

    const recordProbeFailure = (entry: ReaderEntry, detail: string) => {
        if (entry.probeSupported === null) {
            // First answer ever, and it was a refusal. PC/SC had just announced
            // this reader, so the reader is fine and the probe is not available —
            // stop asking rather than reset a working reader on a false negative.
            entry.probeSupported = false;
            console.warn(
                `Health probe unavailable(${entry.name}): ${detail}.`,
                "On Linux, CCID escape commands need ifdDriverOptions = 0x0001 in libccid's Info.plist;",
                "without it the reader can only be watched, not probed.",
            );
            return;
        }

        if (entry.probeSupported === false) {
            return;
        }

        entry.probeFailures += 1;
        console.warn(`Health probe failed(${entry.name}) ${entry.probeFailures}x: ${detail}`);
        if (entry.probeFailures >= PROBE_FAILURES_BEFORE_UNHEALTHY) {
            markUnhealthy(entry, `${entry.name} stopped polling: ${detail}`);
        }
    };

    const attachReader = (reader: NfcReader) => {
        const name = reader.reader.name;
        console.log("Reader ready:", name);

        const entry: ReaderEntry = {
            name,
            reader,
            probeSupported: null,
            probeFailures: 0,
            healthy: true,
        };
        struct.readers.set(name, entry);
        struct.emitMessage(`reader-detected:${name}`);

        reader.on('card', (card: Card) => {
            const eventId = ++struct.totalevents
            console.log(`Card detected ${eventId}`, card);
            // A card getting through is proof the chip is polling, whatever the
            // probe last thought.
            markHealthy(entry);
            struct.emitMessage(`card:${card.uid}`)

            setTimeout(() => {
                struct.emitMessage(`card-removed:${card.uid}`)
            }, 50)
        });
        reader.on('error', (err: Error) => {
            struct.emitMessage(`reader-error:${err.message}`)
            console.error(`Error(${name}):`, err);
        });
        // pcscd drops the reader on an unplug, a USB reset, or its own restart.
        // Without this the entry lingers and every late client is told a reader
        // that is no longer there is ready to scan.
        reader.on('end', () => {
            console.log("Reader removed:", name);
            struct.readers.delete(name);
            struct.emitMessage(`reader-removed:${name}`);
        });
    };

    const startNfc = async () => {
        const instance = new NFC(readerLogger);
        instance.on('reader', attachReader);
        // Without a listener here a PC/SC failure — pcscd restarting, the daemon
        // going away — reaches an EventEmitter with no 'error' handler and throws
        // out of a native callback, taking the whole server with it.
        instance.on('error', (err: Error) => {
            console.error("PC/SC error:", err);
            struct.emitMessage(`pcsc-error:${err.message}`);
            scheduleNfcRestart();
        });
        nfc = instance;
    };

    const scheduleNfcRestart = () => {
        if (restartTimer) {
            return;
        }
        restartTimer = setTimeout(async () => {
            restartTimer = null;
            try {
                nfc?.close();
            } catch (err) {
                console.error("Could not close PC/SC context", err);
            }
            nfc = null;
            for (const name of struct.readers.keys()) {
                struct.emitMessage(`reader-removed:${name}`);
            }
            struct.readers.clear();

            try {
                await startNfc();
            } catch (err) {
                console.error("Could not rebuild PC/SC context", err);
                scheduleNfcRestart();
            }
        }, NFC_RESTART_DELAY_MS);
        restartTimer.unref?.();
    };

    await startNfc();

    if (PROBE_INTERVAL_MS > 0) {
        console.log(`Reader health probe every ${PROBE_INTERVAL_MS}ms`);
        const watchdog = setInterval(() => {
            for (const entry of struct.readers.values()) {
                if (entry.probeSupported === false) {
                    continue;
                }
                probe(entry).catch(err => console.error(`Probe crashed(${entry.name}):`, err));
            }
        }, PROBE_INTERVAL_MS);
        watchdog.unref?.();
    }

    return struct
}

export type ScannerStructure = Awaited<ReturnType<typeof createScannerStructure>>;

let structure: Promise<ScannerStructure> | null = null;

/**
 * One PC/SC context for the whole process. Awaiting a stored promise rather than
 * a stored value matters: two clients connecting at once would each sail past a
 * `if (!structure)` check on the value and open a second context, and two
 * contexts contending for one ACR122U is its own way of killing the reader.
 */
export function getScannerStructure(): Promise<ScannerStructure> {
    if (!structure) {
        structure = createScannerStructure().catch(err => {
            // A failed bring-up must not be cached, or nothing short of a server
            // restart can ever recover.
            structure = null;
            throw err;
        });
    }
    return structure;
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`${message} within ${ms}ms`)), ms);
        promise.then(
            value => { clearTimeout(timer); resolve(value); },
            err => { clearTimeout(timer); reject(err); },
        );
    });
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
