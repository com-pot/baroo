import pino from 'pino';
import type { Handle } from '@sveltejs/kit';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { sequence } from '@sveltejs/kit/hooks';
import { handlePocketBase } from '$lib/auth/client';
import { ServerI18n } from '$lib/server/i18n.server';

const logger = pino()

const handleLogger: Handle = async ({ event, resolve }) => {
    const reqId = crypto.randomUUID()
    event.locals.logger = logger.child({ reqId })

    return resolve(event)
}

const handleParaglide: Handle = ({ event, resolve }) => paraglideMiddleware(event.request, ({ request, locale }) => {
    event.request = request;
    event.locals.i18n = new ServerI18n(locale);

    return resolve(event, {
        transformPageChunk: ({ html }) => html.replace('%paraglide.lang%', locale)
    });
});

export const handle: Handle = sequence(
    handleLogger,
    handlePocketBase,
    handleParaglide,
);
