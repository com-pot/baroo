import { parseStorageRef } from '$lib/bar/refs';
import { validate, getFieldErrors } from '$lib/validation/validator';
import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, locals }) => {
    if (!locals.pb) {
        throw new Error('PocketBase not initialized');
    }

    const ref = parseStorageRef(params.ref);

    if (ref.key === 'new') {
        return { ref, bar: null };
    }

    if (ref.type === 'local') {
        return { ref, bar: null };
    }

    try {
        const bar = await locals.pb.collection('bars').getFirstListItem(`slug="${ref.key}"`);
        return { ref, bar };
    } catch (error) {
        throw redirect(302, '/backstage/bars');
    }
};

export const actions: Actions = {
    save: async ({ request, params, locals }) => {
        if (!locals.pb) {
            return fail(500, { error: 'PocketBase not initialized' });
        }

        const formData = await request.formData();
        const data = {
            slug: formData.get('slug')?.toString() || '',
            name: formData.get('name')?.toString() || ''
        };

        const validationResult = validate('bar', data);

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
                const bar = await locals.pb.collection('bars').create(validationResult.data as any);
                return redirect(303, `/backstage/bars/${bar.slug}`);
            }

            const bar = await locals.pb.collection('bars').getFirstListItem(`slug="${ref.key}"`);
            await locals.pb.collection('bars').update(bar.id, validationResult.data as any);
            return { success: true };
        } catch (err: any) {
            if (err.status === 400 && err.data?.data) {
                const pbErrors: Record<string, string> = {};
                for (const [field, fieldError] of Object.entries(err.data.data)) {
                    pbErrors[field] = (fieldError as any).message;
                }
                return fail(400, { data, errors: pbErrors });
            }

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
            throw redirect(303, '/backstage/bars');
        } catch (error) {
            return fail(500, { error: 'Failed to delete bar' });
        }
    }
};
