import { error, redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
    if (!locals.user) {
        return error(401, 'unauthenticated');
    }

    if (!locals.acl.hasRole('bar-manager')) {
        return error(403, 'unauthorized');
    }

    return {
        user: locals.user
    };
};
