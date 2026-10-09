import { fail } from '@sveltejs/kit';
import {
    checkPairingAttempt,
    claimEnrollmentCode,
    clearPairingFailures,
    recordPairingFailure,
} from '$lib/pos/enrollment.server';
import type { Actions } from './$types';

export const actions: Actions = {
    /**
     * Trades a pairing code for this tablet's identity. Deliberately open to anyone: the
     * code *is* the credential, which is why it is single-use, short-lived and throttled.
     */
    default: async ({ request, getClientAddress }) => {
        const ip = getClientAddress();

        const throttle = checkPairingAttempt(ip);
        if (!throttle.ok) {
            return fail(429, { error: 'throttled', retryAfterMinutes: throttle.retryAfterMinutes });
        }

        const formData = await request.formData();
        const code = formData.get('code')?.toString().trim() ?? '';

        // Load-bearing: an empty code must never reach the lookup, or it would match
        // every device whose code has already been cleared.
        if (!/^\d{4}$/.test(code)) {
            return fail(400, { error: 'bad-format' });
        }

        const claim = await claimEnrollmentCode(code);

        if (!claim.ok) {
            recordPairingFailure(ip);
            return fail(claim.reason === 'unavailable' ? 503 : 400, { error: claim.reason });
        }

        clearPairingFailures(ip);

        return { enrolled: claim.identity };
    },
};
