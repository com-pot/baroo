import { error, redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
    if (!locals.user) {
        return redirect(303, `/login?redirectTo=${encodeURIComponent(url.pathname + url.search)}`);
    }

    if (!locals.acl.hasRole('bar-manager')) {
        return error(403, 'unauthorized');
    }

    return {
        user: locals.user
    };
};
