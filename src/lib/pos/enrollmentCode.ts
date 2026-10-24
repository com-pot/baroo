import { toIsoDate } from '$lib/pocketbase';
import type { PosDevice } from './device';

export type PosEnrollmentCode = {
    id: string;
    code: string;
    device: string;
    expiresAt: string;
    expand?: { device?: PosDevice };
};

export type EnrollmentCodeState = 'pending' | 'expired';

export function enrollmentCodeState(
    code: Pick<PosEnrollmentCode, 'expiresAt'>,
    now = Date.now(),
): EnrollmentCodeState {
    const expiresAt = Date.parse(toIsoDate(code.expiresAt ?? ''));

    return Number.isFinite(expiresAt) && expiresAt > now ? 'pending' : 'expired';
}
