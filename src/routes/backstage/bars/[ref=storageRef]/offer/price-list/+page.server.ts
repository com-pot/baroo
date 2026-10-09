import type { BarOfferItem } from '$lib/bar/BarModel';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
    // Only the items — the bar comes from the section layout. Fetching it again here
    // would be a second identical query racing the layout's on the same client.
    const items = await locals.pb.collection<BarOfferItem>('bar_offer_items').getFullList({
        filter: `bar.slug = "${params.ref}"`,
        sort: 'name',
    });

    return { items };
};
