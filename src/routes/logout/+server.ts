import { redirect } from '@sveltejs/kit';
import { AUTH_COOKIE } from '../../hooks.server';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ cookies, locals }) => {
    locals.pb.authStore.clear();
    cookies.delete(AUTH_COOKIE, { path: '/' });

    redirect(303, '/login');
};
