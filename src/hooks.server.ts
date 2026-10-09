import type { Handle } from '@sveltejs/kit';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { sequence } from '@sveltejs/kit/hooks';
import { createAnonymousDb, readRoles } from '$lib/db.server';

export const AUTH_COOKIE = 'pb_auth';

/**
 * Attaches a PocketBase client to every request, authenticated from the session cookie
 * when there is one.
 *
 * Deliberately does no network I/O: the cookie carries the token *and* the auth record
 * (roles expanded at login), and `authStore.isValid` checks expiry locally. An anonymous
 * request — every kiosk hit — therefore costs zero round-trips, and the app can still
 * serve its own HTML when PocketBase is unreachable. That property is what lets the
 * offline kiosk shell load at all.
 */
const handlePocketBase: Handle = async ({ event, resolve }) => {
    const pb = event.locals.pb = createAnonymousDb();

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

const handleParaglide: Handle = ({ event, resolve }) => paraglideMiddleware(event.request, ({ request, locale }) => {
    event.request = request;

    return resolve(event, {
        transformPageChunk: ({ html }) => html.replace('%paraglide.lang%', locale)
    });
});

export const handle: Handle = sequence(
    handlePocketBase,
    handleParaglide,
);
