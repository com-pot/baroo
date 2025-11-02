import { createDb } from '$lib/db.server';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
    if (!locals.pb) {
        throw new Error('PocketBase not initialized');
    }

    const bars = await locals.pb.collection('bars')
        .getFullList({
            sort: 'name'
        })

    return {
        bars,
    };
};
