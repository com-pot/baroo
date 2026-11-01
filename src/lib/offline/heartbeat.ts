import { appError, type AppError } from "$lib/errors";

export const heartbeatConfig = Object.freeze({
    interval: Temporal.Duration.from({ seconds: 30 }),
    timeout: Temporal.Duration.from({ seconds: 4 }),

    offlineInterval: Temporal.Duration.from({ seconds: 4 }),
})

/**
 * One probe
 *
 * Never throws
 */
export async function probeHeartbeat(timeoutMs: number): Promise<{ at: string } | AppError> {
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
            return appError(body?.reason || `heartbeat-${response.status}`);
        }

        return { at: body.at || new Date().toISOString() };
    } catch (err) {
        const error = err instanceof DOMException && err.name === 'TimeoutError'
            ? 'heartbeat-timeout'
            : 'heartbeat-unreachable'
        return appError(error)
    }
}
