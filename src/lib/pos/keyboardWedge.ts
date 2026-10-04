const DEFAULTS = {
    maxGapMs: 30,
    idleFlushMs: 120,
    minLength: 4,
};

export type KeyboardWedgeOptions = {
    onScan: (raw: string) => void;
} & Partial<typeof DEFAULTS>

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

        if (raw.length < minLength) return false;

        onScan(raw);
        return true;
    };

    const onKeyDown = (event: KeyboardEvent) => {
        if (event.ctrlKey || event.altKey || event.metaKey) return;
        if (isEditable(event.target)) return;

        const now = Date.now();
        const gap = now - lastKeyAt;
        lastKeyAt = now;

        if (event.key === 'Enter') {
            if (buffer && gap <= maxGapMs && flush()) event.preventDefault();
            return;
        }

        if (event.key.length !== 1) return;
        if (gap > maxGapMs) {
            buffer = event.key
        } else {
            buffer += event.key
        }

        clearIdleTimer();
        idleTimer = setTimeout(flush, idleFlushMs);
    };

    target.addEventListener('keydown', onKeyDown);

    return () => {
        clearIdleTimer();
        target.removeEventListener('keydown', onKeyDown);
    };
}

function isEditable(node: EventTarget | null): boolean {
    if (!node || !(node instanceof Element)) return false;

    const tag = node.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;

    return node instanceof HTMLElement && node.isContentEditable;
}
