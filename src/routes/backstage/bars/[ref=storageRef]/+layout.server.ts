import { error } from '@sveltejs/kit';
import type { Bar } from '$lib/bar/BarModel';
import type { LayoutServerLoad } from './$types';

/** The bar record every tab needs. Role is already enforced by `backstage/+layout.server.ts`. */
export const load: LayoutServerLoad = async ({ params, route, locals }) => {
    const ref = params.ref;

    if (ref === 'new') {
        // `new` is the create form, which lives on the dashboard. No sub-page can exist
        // for a bar that hasn't been saved yet.
        if (route.id !== '/backstage/bars/[ref=storageRef]') {
            error(404, 'bar-not-created');
        }
        return { ref, bar: null };
    }

    const bar = await locals.pb.collection<Bar>('bars').getFirstListItem(`slug="${ref}"`);

    return { ref, bar };
};
