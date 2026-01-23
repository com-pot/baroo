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

type TotalCounterStorage = {
    get: () => Promise<number>,
    set: (value: number) => Promise<unknown>,
}
export class TotalCounter {
    public constructor(private storage: TotalCounterStorage) {

    }

    public value = $state(0);

    public trigger(n: number = 1) {
        this.value += n;
    }

    public async load() {
        this.value = await this.storage.get();
    }
    public async commit() {
        const result = await this.storage.set(this.value);
        if (typeof result === 'number') {
            this.value = result;
        }
    }
}

type CpsConfig = {
    windowSizeMs: number,
    totalTime: number
}
