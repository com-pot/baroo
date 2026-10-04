import { fail, redirect } from '@sveltejs/kit';
import { ClientResponseError } from 'pocketbase';
import z from 'zod';
import { zFromForm } from '$lib/zchem/schema';
import { AUTH_COOKIE, safeRedirect } from '$lib/auth/client';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
    if (locals.user) {
        redirect(303, safeRedirect(url.searchParams.get('redirectTo')));
    }

    return { redirectTo: url.searchParams.get('redirectTo') };
};

const loginSchema = z.object({
    who: z.string().min(1),
    password: z.string().min(1),
    redirectTo: z.string().optional(),
})

export const actions: Actions = {
    default: async ({ request, locals, cookies, url }) => {
        const input = loginSchema.safeParse(zFromForm(loginSchema, await request.formData())) ;
        if (!input.success) {
            return fail(400, { error: 'missing-credentials' });
        }

        try {
            await locals.pb.collection('users')
                .authWithPassword(input.data.who, input.data.password, {
                    expand: 'roles',
                });
        } catch (err) {
            if (err instanceof ClientResponseError && (err.status === 400 || err.status === 403)) {
                return fail(400, { who: input.data.who, error: 'invalid-credentials' });
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

        redirect(303, safeRedirect(input.data.redirectTo || null));
    },
};
