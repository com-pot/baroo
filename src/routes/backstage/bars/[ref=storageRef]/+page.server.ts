import { barDoUnseal } from '$lib/bar/ops/unseal';
import { formatPbError } from '$lib/db.server';
import { barSchema } from '$lib/model/bar';
import { getFieldErrors } from '$lib/validation/validator';
import z from 'zod';
import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { zFromForm } from '$lib/zchem/schema';
import getSnapshot from '$lib/bar/snapshot/getSnapshot';

export const load: PageServerLoad = async ({ parent, locals }) => {
    const { bar } = await parent();
    const snapshot = bar ? await getSnapshot(locals, bar.slug) : null

    return { snapshot };
};

const unsealDataSchema = z.object({
    eventType: z.literal("unseal"),
    offerItemKey: z.string().min(1),
    quantity: z.number().gt(0),
})
export const actions: Actions = {
    createEvent: async ({ request, params, locals }) => {
        const ref = params.ref;
        if (ref === 'new') {
            return fail(400, { error: 'Cannot create events for this bar' });
        }

        const input = unsealDataSchema.safeParse(zFromForm(unsealDataSchema, await request.formData()));

        if (!input.success) {
            return fail(400, { error: 'Invalid data', issues: input.error.issues });
        }

        try {
            await barDoUnseal(locals, ref, input.data)

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

        const validationResult = barSchema.safeParse(data);

        if (!validationResult.success) {
            return fail(400, {
                data,
                errors: getFieldErrors(validationResult.error.issues)
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
