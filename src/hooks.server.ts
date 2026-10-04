import type { Handle } from '@sveltejs/kit';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { sequence } from '@sveltejs/kit/hooks';
import { createAnonymousDb, readRoles } from '$lib/db.server';
import pino from 'pino';

export const AUTH_COOKIE = 'pb_auth';

const logger = pino()

const handleLogger: Handle = async ({ event, resolve }) => {
    const reqId = crypto.randomUUID()
    event.locals.logger = logger.child({ reqId })

    return resolve(event)
}

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
    handleLogger,
    handlePocketBase,
    handleParaglide,
);
