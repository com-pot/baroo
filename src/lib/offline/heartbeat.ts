
export const heartbeatConfig = Object.freeze({
    interval: Temporal.Duration.from({ seconds: 30 }),
    timeout: Temporal.Duration.from({ seconds: 4 }),

    offlineInterval: Temporal.Duration.from({ seconds: 4 }),
})

/**
 * One probe.
 *
 * Never throws: an unreachable server is the answer we came for, not a failure.
 */
export async function probeHeartbeat(timeoutMs: number): Promise<PromiseSettledResult<{ at: string }>> {
    try {
        const response = await fetch('/api/heartbeat', {
            cache: 'no-store',
            headers: { accept: 'application/json' },
            signal: AbortSignal.timeout(timeoutMs),
        });

        const body = (await response.json().catch(() => null)) as
            | { ok?: boolean; at?: string; reason?: string }
            | null;

        if (!response.ok || body?.ok !== true) {
            return { status: "rejected", reason: body?.reason || `heartbeat-${response.status}` };
        }

        return { status: "fulfilled", value:  { at: body.at || new Date().toISOString() } };
    } catch (err) {
        return {
            status: "rejected",
            reason: err instanceof DOMException && err.name === 'TimeoutError'
                ? 'heartbeat-timeout'
                : 'heartbeat-unreachable',
        };
    }
}
