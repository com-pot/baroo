
export type ThrottleOptions = {
    maxFailures: number,
    windowMs: number,
    lockoutMs: number,

    bucketLimit: number,

    globalMaxFailures: number,
    globalWindowMs: number,
}

export type ThrottleVerdict = { ok: true } | { ok: false; retryAfterMinutes: number };

type ThrottleNow = ReturnType<Date["getTime"]>

export class Throttle {

    public readonly failures = new Map<string, { count: number; since: number; until: number }>();
    public globalFailures = { count: 0, since: 0 };

    public constructor(private readonly options: ThrottleOptions) {

    }

    public check(key: string, now: ThrottleNow): ThrottleVerdict {
        if (this.globalFailures.since > now - this.options.globalWindowMs && this.globalFailures.count >= this.options.globalMaxFailures) {
            return { ok: false, retryAfterMinutes: minutesUntil(this.globalFailures.since + this.options.globalWindowMs, now) };
        }

        const bucket = this.failures.get(key);
        if (bucket && bucket.until > now) {
            return { ok: false, retryAfterMinutes: minutesUntil(bucket.until, now) };
        }

        return { ok: true };
    }

    public fail(ctx: Pick<App.Locals, "logger">, key: string, now: ThrottleNow) {
        if (this.globalFailures.since <= now - this.options.globalWindowMs) {
            this.globalFailures = { count: 0, since: now };
        }
        this.globalFailures.count++;
        if (this.globalFailures.count === this.options.globalMaxFailures) {
            ctx.logger.error('pairing: global failed-attempt budget spent — codes are being guessed');
        }

        const bucket = this.failures.get(key);
        if (!bucket || bucket.since <= now - this.options.windowMs) {
            this.prune(now);
            this.failures.set(key, { count: 1, since: now, until: 0 });
            return;
        }

        bucket.count++;
        if (bucket.count >= this.options.maxFailures) {
            bucket.until = now + this.options.lockoutMs;
            bucket.count = 0;
            bucket.since = now;
        }
    }

    public clear(key: string) {
        this.failures.delete(key);
    }

    public prune(now: ThrottleNow) {
        for (const [ip, bucket] of this.failures) {
            if (bucket.until <= now && bucket.since <= now - this.options.windowMs) this.failures.delete(ip);
        }

        if (this.failures.size < this.options.bucketLimit) return;

        for (const ip of [...this.failures.keys()].slice(0, this.failures.size - this.options.bucketLimit + 1)) {
            this.failures.delete(ip);
        }
    }
}

function minutesUntil(at: number, now: number): number {
    return Math.max(1, Math.ceil((at - now) / 60_000));
}
