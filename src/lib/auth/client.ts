import { env } from '$env/dynamic/private';
import { createAnonymousDb, readRoles } from "$lib/db.server";
import type { Handle } from "@sveltejs/kit";

/**
 * Sanitizes redirect target for Baroo
 */
export const safeRedirect = (target: string | null): string => {
    return target && target.startsWith('/') && !target.startsWith('//') ? target : '/backstage/bars';
}

export const AUTH_COOKIE = 'pb_auth';
export const handlePocketBase: Handle = async ({ event, resolve }) => {
    const pb = event.locals.pb = createAnonymousDb(env);

    const cookie = event.request.headers.get('cookie');
    if (cookie) {
        pb.authStore.loadFromCookie(cookie);
    }

    if (pb.authStore.isValid && pb.authStore.record) {
        const record = pb.authStore.record;
        event.locals.user = {
            id: record.id,
            email: record.email,
            name: record.name,
            roles: readRoles(record),
        };
    }

    event.locals.acl = {
        hasRole: (role: string) => event.locals.user?.roles?.includes(role) || false
    }

    const response = await resolve(event);
    return response;
};
