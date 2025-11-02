import type { Handle } from '@sveltejs/kit';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { sequence } from '@sveltejs/kit/hooks';
import { FIXME_DEBUGGING_CREATE_DB_FROM_ENV } from '$lib/db.server';

const handlePocketBase: Handle = async ({ event, resolve }) => {
    const pb = event.locals.pb = await FIXME_DEBUGGING_CREATE_DB_FROM_ENV();

    if (pb.authStore.isValid && pb.authStore.record) {
        const user = await pb.collection(pb.authStore.record.collectionName)
            .getOne<{
                email: string,
                name: string,
                id: string,
                expand: {
                    roles: { name: string }[],
                },
            }>(pb.authStore.record.id, { expand: 'roles', fields: '*,roles.*' });

        event.locals.user = {
            email: user.email,
            name: user.name,
            id: user.id,

            roles: (user.expand.roles).map(role => role.name)
        }
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
