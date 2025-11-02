import type { Bar } from '$lib/bar/BarModel';
import { parseStorageRef } from '$lib/bar/refs';
import { getBarOfferItems } from '$lib/bar/stats/barOfferItems';
import { getMemberOrders } from '$lib/bar/stats/memberOrders';
import { formatPbError } from '$lib/db.server';
import { validate, getFieldErrors } from '$lib/validation/validator';
import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, locals }) => {
    if (!locals.pb) {
        throw new Error('PocketBase not initialized');
    }

    const ref = parseStorageRef(params.ref);

    if (ref.key === 'new') {
        return { ref, bar: null, stats: null, offerItems: [] };
    }

    if (ref.type === 'local') {
        return { ref, bar: null, stats: null, offerItems: [] };
    }

    const bar = await locals.pb.collection<Bar>('bars')
        .getFirstListItem(`slug="${ref.key}"`)

    const memberStats = await getMemberOrders(locals.pb, { slug: bar.slug });

    const stats = {
        memberStats,
        offerItems: await getBarOfferItems(locals.pb, bar)
    };

    return { ref, bar, stats };
};

export const actions: Actions = {
    createEvent: async ({ request, params, locals }) => {
        if (!locals.pb) {
            return fail(500, { error: 'PocketBase not initialized' });
        }

        const ref = parseStorageRef(params.ref);
        if (ref.type === 'local' || ref.key === 'new') {
            return fail(400, { error: 'Cannot create events for this bar' });
        }

        const formData = await request.formData();
        const eventType = formData.get('eventType')?.toString();
        const offerItemKey = formData.get('offerItemKey')?.toString();

        if (eventType !== 'keg-uncork') {
            return fail(400, { error: 'Invalid event type' });
        }

        if (!offerItemKey) {
            return fail(400, { error: 'Offer item is required' });
        }

        try {
            await locals.pb.collection('events')
                .create({
                    type: 'keg-uncork',
                    target: `bar:${ref.key}`,
                    data: {
                        offerItemKey,
                    },
                })

            return { success: true, action: 'createEvent' };
        } catch (err) {
            return fail(500, { error: 'Failed to create event' });
        }
    },

    save: async ({ request, params, locals }) => {
        if (!locals.pb) {
            return fail(500, { error: 'PocketBase not initialized' });
        }

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

        const ref = parseStorageRef(params.ref);

        if (ref.type === 'local') {
            return fail(400, { error: 'Cannot edit local bars through backstage' });
        }

        try {
            if (params.ref === 'new') {
                const bar = await locals.pb.collection('bars').create(validationResult.data);
                return redirect(303, `/backstage/bars/${bar.slug}`);
            }

            const bar = await locals.pb.collection('bars').getFirstListItem(`slug="${ref.key}"`);
            await locals.pb.collection('bars').update(bar.id, validationResult.data);
            return { success: true };
        } catch (err) {
            const formattedError = formatPbError(err)
            if (formattedError) return fail(400, formattedError);

            throw err;
        }
    },

    delete: async ({ params, locals }) => {
        if (!locals.pb) {
            return fail(500, { error: 'PocketBase not initialized' });
        }

        const ref = parseStorageRef(params.ref);
        if (ref.type === 'local') {
            return fail(400, { error: 'Cannot delete local bars' });
        }

        if (ref.key === 'new') {
            return fail(400, { error: 'Cannot delete a new bar' });
        }

        try {
            await locals.pb.collection('bars').delete(ref.key);
        } catch (error) {
            return fail(500, { error: 'Failed to delete bar' });
        }

        return redirect(303, '/backstage/bars');
    }
};
