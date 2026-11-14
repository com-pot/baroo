import { error } from '@sveltejs/kit';
import type { Bar } from '$lib/bar/BarModel';
import type { LayoutServerLoad } from './$types';

const layoutRouteId = '/backstage/bars/[ref=storageRef]'
export const load: LayoutServerLoad = async ({ params, route, locals }) => {
    const ref = params.ref;

    if (ref === 'new') {
        if (route.id !== '/backstage/bars/[ref=storageRef]') {
            error(404, 'bar-not-created');
        }

        return { layoutRouteId, ref, bar: { id: '', name: '', slug: '', currency: "czk" } satisfies Bar };
    }

    const bar = await locals.pb.collection<Bar>('bars').getFirstListItem(`slug="${ref}"`);

    return { layoutRouteId, ref, bar };
};
