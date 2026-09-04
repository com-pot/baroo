export class BrainrotSoundPad {

    public readonly files: {src: string}[] = $state([]);

    constructor(public readonly icon: string, files: {src: string}[]) {
        this.files = files;
    }

    public trigger() {
        const i = Math.floor(Math.random() * this.files.length);
        const audio = new Audio(this.files[i].src);
        audio.playbackRate = Math.random() * 0.4 + 0.8;
        audio.volume = Math.random() * 0.2 + 0.1;
        audio.play();
    }
}

export class StreakCounter {
    private decayRate = 33;
    public decayDuration = 10_000;

    public count = $state(0);
    private decayInterval: ReturnType<typeof setTimeout> | null = null;
    private decayTime = $state(0);

    public readonly remainingPct = $derived.by(() => this.decayTime / this.decayDuration);

    public constructor(private readonly opts?: { onExpire?: (value: number) => void}) {

    }

    public trigger(n: number = 1) {
        this.count += n
        this.decayTime = this.decayDuration;

        this.startDecay()
    }

    private startDecay() {
        if (this.decayInterval) {
            return
        }

        this.decayInterval = setInterval(() => {
            this.decayTime -= this.decayRate * 10;
            if (this.decayTime > 0) return;

            if (this.opts?.onExpire) {
                this.opts.onExpire(this.count)
            }

            this.count = 0;
            if (this.decayInterval) {
                clearInterval(this.decayInterval);
                this.decayInterval = null;
            }
        }, this.decayRate);
    }
}


export class DecayCounter {
    public maxValue = 90 * 1_000;
    private decayRate = 33;
    public value = $state(0);

    private decayInterval: ReturnType<typeof setTimeout> | null = null;

    public readonly remainingPct = $derived.by(() => this.value / this.maxValue);

    public trigger(n: number = 15_000) {
        this.value = Math.min(this.value + n, this.maxValue)

        this.startDecay()
    }

    private startDecay() {
        if (this.decayInterval) {
            return
        }

        this.decayInterval = setInterval(() => {
            this.value -= this.decayRate;
            if (this.value > 0) return;

            this.value = 0;
            if (this.decayInterval) {
                clearInterval(this.decayInterval);
                this.decayInterval = null;
            }
        }, this.decayRate);
    }
}

export class CpsCounter {
    public windows = $state([]) as number[];
    private now = $state(Date.now())
    public readonly currentKey = $derived.by(() => {
        return Math.floor(this.now / this.config.windowSizeMs) % this.windows.length;
    })
    public readonly totalClicks = $derived.by(() => {
        return this.windows.reduce((a, b) => a + b, 0);
    })
    public readonly value = $derived.by(() => {
        const totalTimeSec = (this.config.totalTime) / 1_000;
        return this.totalClicks / totalTimeSec;
    })

    constructor (
        public readonly config: CpsConfig,
    ) {
        const windowsLength = this.config.totalTime / this.config.windowSizeMs;
        this.windows = Array.from({ length: windowsLength }, () => 0)
    }

    public trigger() {
        this.windows[this.currentKey] += 1
    }

    public activate() {
        const interval = setInterval(() => {
            this.now = Date.now()
            this.windows[this.currentKey] = 0
        }, this.config.windowSizeMs)

        return () => {
            clearInterval(interval)
        }
    }
}

export type CounterState = {
    /** Everyone's clicks, as the server knows them. */
    total: number,
    /** This device's share of them. */
    mine: number,
}

type TotalCounterStorage = {
    load: () => Promise<CounterState>,
    /** Adds `delta` and answers with the counter as it stands afterwards. */
    push: (delta: number) => Promise<CounterState>,
}

/**
 * The shared counter, as this device sees it.
 *
 * Deltas rather than absolutes, because the total is not ours alone: between two of our
 * clicks any number of other people have pushed their own, so writing back a number we
 * computed locally would silently discard theirs.
 */
export class TotalCounter {
    public constructor(private storage: TotalCounterStorage) {}

    public total = $state(0);
    public mine = $state(0);

    /** Clicks the server has not acknowledged yet. */
    private pending = 0;
    private draining = false;

    public trigger(n: number = 1) {
        this.pending += n;
        // Optimistic: the bubble has to move on the click, not a network round trip later.
        this.total += n;
        this.mine += n;
    }

    public async load() {
        this.reconcile(await this.storage.load());
    }

    /**
     * Pushes what has piled up, one request at a time.
     *
     * Several people hammering the same counter is the normal case here, so a push is a
     * read-modify-write the server has to serialise; adding our own concurrency on top of
     * that just multiplies the contention. Clicks that land mid-flight ride the next lap of
     * the loop instead of racing this one.
     */
    public async commit() {
        if (this.draining) return;

        this.draining = true;
        try {
            while (this.pending > 0) {
                const delta = this.pending;
                this.pending = 0;

                try {
                    this.reconcile(await this.storage.push(delta));
                } catch (err) {
                    // Hand the clicks back so the next commit retries them: a failed push
                    // should cost the tick, not the taps.
                    this.pending += delta;
                    throw err;
                }
            }
        } finally {
            this.draining = false;
        }
    }

    /**
     * The server's numbers already include everything we pushed, but not what was clicked
     * while we waited for it — that is still only ours to know.
     */
    private reconcile(state: CounterState) {
        this.total = state.total + this.pending;
        this.mine = state.mine + this.pending;
    }
}

type CpsConfig = {
    windowSizeMs: number,
    totalTime: number
}
