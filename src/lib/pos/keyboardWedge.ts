/**
 * Reading an external NFC reader on a tablet, without a server.
 *
 * A CCID/PC/SC reader — the Akasa, an ACR122U, anything the OS binds a smart-card
 * driver to — cannot be reached from a web page at all: WebUSB refuses the smart-card
 * interface class, WebHID does not exist on Android, and the Web Smart Card API is
 * ChromeOS- and Isolated-Web-App-only. On a tablet there is also nowhere to put a
 * helper process. So the only external reader a browser can hear is one that pretends
 * to be a keyboard: it "types" the card serial and usually presses Enter, and Android
 * hands those keystrokes to Chrome like any other USB keyboard.
 *
 * The catch is that the barman's own typing arrives the same way, so the two are told
 * apart by speed. A reader emits a whole serial in a few milliseconds per character; a
 * person cannot. Anything slower than `maxGapMs` per keystroke starts the buffer over,
 * so human typing never accumulates enough to look like a scan.
 */

export type KeyboardWedgeOptions = {
    /** Called with the serial the reader typed, once a burst completes. */
    onScan: (raw: string) => void;
    /**
     * Longest pause between two characters that still counts as one machine-typed
     * burst. Wedge readers sit near 5ms; the fastest human is well above 30ms.
     */
    maxGapMs?: number;
    /**
     * Readers that do not send Enter are flushed once they fall quiet for this long.
     * Must stay above `maxGapMs` or a burst would flush itself mid-serial.
     */
    idleFlushMs?: number;
    /** Shortest burst worth reporting. Stray keypresses are not scans. */
    minLength?: number;
};

const DEFAULTS = {
    maxGapMs: 30,
    idleFlushMs: 120,
    minLength: 4,
};

/**
 * Starts listening for wedge scans on `target`. Returns the teardown function.
 *
 * Keystrokes aimed at a field the barman is filling in are left alone — the manual id
 * input has its own submit path, and stealing its keys would make it untypable.
 */
export function listenForKeyboardWedge(
    target: Pick<Document, 'addEventListener' | 'removeEventListener'>,
    options: KeyboardWedgeOptions,
): () => void {
    const { onScan, maxGapMs, idleFlushMs, minLength } = { ...DEFAULTS, ...options };

    let buffer = '';
    let lastKeyAt = 0;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;

    const clearIdleTimer = () => {
        if (idleTimer === undefined) return;
        clearTimeout(idleTimer);
        idleTimer = undefined;
    };

    const flush = () => {
        clearIdleTimer();

        const raw = buffer;
        buffer = '';

        // Held back rather than reported: a one- or two-character burst is a stray
        // keypress, and passing it on would file it as an unknown tag.
        if (raw.length < minLength) return false;

        onScan(raw);
        return true;
    };

    const onKeyDown = (event: KeyboardEvent) => {
        // A shortcut is not a card. Shift is allowed through — readers use it for the
        // upper-case half of a hex serial.
        if (event.ctrlKey || event.altKey || event.metaKey) return;

        if (isEditable(event.target)) return;

        const now = Date.now();
        const gap = now - lastKeyAt;
        lastKeyAt = now;

        if (event.key === 'Enter') {
            // Only the Enter that closes a burst we were actually collecting. A bare
            // Enter on an idle kiosk must stay available to the rest of the page.
            if (buffer && gap <= maxGapMs && flush()) event.preventDefault();
            buffer = '';
            clearIdleTimer();
            return;
        }

        // `key` is a single character for printable keys and a name ("Tab", "F5") for
        // everything else, which is how the non-typing keys are filtered out here.
        if (event.key.length !== 1) return;

        // Too slow to be a machine: whatever came before was not part of this burst.
        buffer = gap <= maxGapMs ? buffer + event.key : event.key;

        clearIdleTimer();
        idleTimer = setTimeout(flush, idleFlushMs);
    };

    target.addEventListener('keydown', onKeyDown as EventListener);

    return () => {
        clearIdleTimer();
        target.removeEventListener('keydown', onKeyDown as EventListener);
    };
}

/** Whether keystrokes on this element belong to someone filling in a field. */
function isEditable(node: EventTarget | null): boolean {
    if (!node || !(node instanceof Element)) return false;

    const tag = node.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;

    return node instanceof HTMLElement && node.isContentEditable;
}
