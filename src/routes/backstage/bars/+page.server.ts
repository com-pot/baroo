import { ensureUser } from '$lib/acl.server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
    ensureUser(locals, ['bar-manager'])
    const bars = await locals.pb.collection('bars')
        .getFullList({
            sort: 'name'
        })

    return {
        bars,
    };
};
