import { fail, redirect } from '@sveltejs/kit';
import { ClientResponseError } from 'pocketbase';
import { AUTH_COOKIE } from '../../hooks.server';
import type { PageServerLoad, Actions } from './$types';

const safeRedirect = (target: string | null) =>
    target && target.startsWith('/') && !target.startsWith('//') ? target : '/backstage/bars';

export const load: PageServerLoad = async ({ locals, url }) => {
    if (locals.user) {
        redirect(303, safeRedirect(url.searchParams.get('redirectTo')));
    }

    return { redirectTo: url.searchParams.get('redirectTo') };
};

export const actions: Actions = {
    default: async ({ request, locals, cookies, url }) => {
        const formData = await request.formData();
        const email = formData.get('email')?.toString() || '';
        const password = formData.get('password')?.toString() || '';
        const redirectTo = safeRedirect(formData.get('redirectTo')?.toString() || null);

        if (!email || !password) {
            return fail(400, { email, error: 'missing-credentials' });
        }

        try {
            // `expand: 'roles'` matters: the expanded record is what gets serialised into
            // the cookie, and it is the only thing `hooks.server.ts` reads roles from.
            await locals.pb.collection('users').authWithPassword(email, password, {
                expand: 'roles',
            });
        } catch (err) {
            if (err instanceof ClientResponseError && (err.status === 400 || err.status === 403)) {
                return fail(400, { email, error: 'invalid-credentials' });
            }
            throw err;
        }

        cookies.set(AUTH_COOKIE, JSON.stringify({
            token: locals.pb.authStore.token,
            record: locals.pb.authStore.record,
        }), {
            path: '/',
            httpOnly: true,
            sameSite: 'lax',
            secure: url.protocol === 'https:',
            maxAge: 60 * 60 * 24 * 14,
        });

        redirect(303, redirectTo);
    },
};
