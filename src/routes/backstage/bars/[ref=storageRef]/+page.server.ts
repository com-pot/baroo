import { getBarOfferItems, collectClosureData, type UnsealEvent } from '$lib/bar/stats/barOfferItems';
import { getMemberOrders } from '$lib/bar/stats/memberOrders';
import { formatPbError } from '$lib/db.server';
import { validate, getFieldErrors } from '$lib/validation/validator';
import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ parent, locals }) => {
    // The bar comes from the section layout; this load owns only the (expensive) stats.
    const { bar } = await parent();

    if (!bar) {
        return { stats: null };
    }

    const memberStats = await getMemberOrders(locals.pb, { slug: bar.slug });

    const offerItems = await getBarOfferItems(locals.pb, bar);

    // Get all closure events for each offer item
    const closureEvents: Record<string, any[]> = {};
    for (const offerItem of offerItems) {
        const closureList = await locals.pb.collection('events')
            .getFullList({
                filter: `type = "unseal" && target = "bar:${bar.slug}" && data.offerItemKey = "${offerItem.data.key}"`,
                sort: '-created'
            });
        closureEvents[offerItem.data.key] = closureList;
    }

    const stats = {
        memberStats,
        offerItems,
        closureEvents,
    };

    return { stats };
};

export const actions: Actions = {
    createEvent: async ({ request, params, locals }) => {
        const ref = params.ref;
        if (ref === 'new') {
            return fail(400, { error: 'Cannot create events for this bar' });
        }

        const formData = await request.formData();
        const eventType = formData.get('eventType')?.toString();
        const offerItemKey = formData.get('offerItemKey')?.toString();
        // What the package holds, in the item's own measure: 30 litres, or 24 bags.
        const quantity = Number(formData.get('quantity'));

        if (eventType !== 'unseal') {
            return fail(400, { error: 'Invalid event type' });
        }

        if (!offerItemKey) {
            return fail(400, { error: 'Offer item is required' });
        }

        // Strictly positive: an unseal that records nothing would read back as a package
        // nobody has opened.
        if (!Number.isFinite(quantity) || quantity <= 0) {
            return fail(400, { error: 'Quantity must be a positive number' });
        }

        try {
            // First, close out the package being replaced: how much came out of it, and
            // who drank it. Has to happen before the new event moves the since-date.
            const closureData = await collectClosureData(locals.pb, { slug: ref }, offerItemKey);

            await locals.pb.collection('events')
                .create({
                    type: 'unseal',
                    target: `bar:${ref}`,
                    occurredAt: new Date().toISOString(),
                    data: {
                        offerItemKey,
                        quantity,
                        closureData,
                    },
                } satisfies Omit<UnsealEvent, "id">)

            return { success: true, action: 'createEvent' };
        } catch (err) {
            console.error('Failed to create event:', err);
            return fail(500, { error: 'Failed to create event' });
        }
    },

    save: async ({ request, params, locals }) => {
        const formData = await request.formData();
        const data = {
            slug: formData.get('slug')?.toString() || '',
            name: formData.get('name')?.toString() || ''
        };

        const validationResult = validate<Record<string, unknown>>('bar', data);

        if (!validationResult.valid) {
            return fail(400, {
                data,
                errors: getFieldErrors(validationResult.errors || [])
            });
        }

        const ref = params.ref;

        try {
            if (params.ref === 'new') {
                const bar = await locals.pb.collection('bars').create(validationResult.data);
                return redirect(303, `/backstage/bars/${bar.slug}`);
            }

            const bar = await locals.pb.collection('bars').getFirstListItem(`slug="${ref}"`);
            const updatedBar = await locals.pb.collection('bars').update(bar.id, validationResult.data);
            return { success: true, data: { slug: updatedBar.slug, name: updatedBar.name } };
        } catch (err) {
            const formattedError = formatPbError(err)
            if (formattedError) return fail(400, formattedError);

            throw err;
        }
    },

    delete: async ({ params, locals }) => {
        const ref = params.ref;
        if (ref === 'new') {
            return fail(400, { error: 'Cannot delete a new bar' });
        }

        try {
            await locals.pb.collection('bars').delete(ref);
        } catch (error) {
            return fail(500, { error: 'Failed to delete bar' });
        }

        return redirect(303, '/backstage/bars');
    }
};
