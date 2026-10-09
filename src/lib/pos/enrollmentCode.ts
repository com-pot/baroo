import type { PosDevice } from './device';

/**
 * An outstanding invitation for a tablet to become one particular device.
 *
 * A code is a passing event, not a property of the device, so it lives in its own
 * collection: one row per device at most, deleted the moment it is claimed.
 */
export type PosEnrollmentCode = {
    id: string;
    code: string;
    /** The device id; `expand.device` is present when expanded. */
    device: string;
    expiresAt: string;
    expand?: { device?: PosDevice };
};

/** Whether a code can still be typed in. */
export type EnrollmentCodeState = 'pending' | 'expired';

export function enrollmentCodeState(
    code: Pick<PosEnrollmentCode, 'expiresAt'>,
    now = Date.now(),
): EnrollmentCodeState {
    // PocketBase hands dates back as `2026-08-31 18:44:12.345Z`; the space is only
    // parseable by engine goodwill, so make it an ISO string first.
    const expiresAt = Date.parse((code.expiresAt ?? '').replace(' ', 'T'));

    return Number.isFinite(expiresAt) && expiresAt > now ? 'pending' : 'expired';
}
