import type { BarOfferItem } from '$lib/bar/BarModel';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, parent }) => {
    const { bar } = await parent()
    if (!bar) {
        throw error(404)
    }

    const items = await locals.pb.collection<BarOfferItem>('bar_offer_items')
        .getFullList({
            filter: `bar.slug = "${params.ref}"`,
            sort: 'name',
        });

    return { items, bar };
};
