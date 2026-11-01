import { fail } from '@sveltejs/kit';
import {
    claimEnrollmentCode,
} from '$lib/pos/enrollment.server';
import type { Actions } from './$types';
import { appError, isError } from '$lib/errors';
import { Throttle } from '$lib/auth/throttle';

const ipThrottle = new Throttle({
    maxFailures: 5,
    windowMs: 10 * 60 * 1000,
    lockoutMs: 15 * 60 * 1000,

    bucketLimit: 5_000,

    globalMaxFailures: 100,
    globalWindowMs: 60 * 60 * 1000,
})

export const actions: Actions = {
    default: async ({ request, getClientAddress, locals }) => {
        const ip = getClientAddress();

        const throttle = ipThrottle.check(ip, Date.now());
        if (!throttle.ok) {
            return fail(429, { error: 'throttled', retryAfterMinutes: throttle.retryAfterMinutes });
        }

        const formData = await request.formData();
        const code = formData.get('code')?.toString().trim() ?? '';

        const identity = await claimEnrollmentCode(code)
            .catch((err) => appError("claim-failed", { err }))

        if (isError(identity)) {
            ipThrottle.fail(locals, ip, Date.now());
            return fail(400, identity.data);
        }

        ipThrottle.clear(ip);

        return { enrolled: identity };
    },
};
