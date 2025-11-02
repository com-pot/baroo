import { parseStorageRef } from '$lib/bar/refs';
import { validate, getFieldErrors } from '$lib/validation/validator';
import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, locals }) => {
    if (!locals.pb) {
        throw new Error('PocketBase not initialized');
    }

    const ref = parseStorageRef(params.ref);

    if (ref.type === 'local') {
        return {
            ref,
            bar: { slug: ref.key, name: `Local Bar ${ref.key}` },
            items: [],
        };
    }

    const bar = await locals.pb.collection('bars').getFirstListItem(`slug="${ref.key}"`);

    const items = await locals.pb.collection('bar_offer_items').getFullList({
        filter: `bar.slug = "${ref.key}"`,
        sort: 'name'
    });

    return {
        ref,
        bar,
        items,
    };
};

export const actions: Actions = {
    create: async ({ request, params, locals }) => {
        if (!locals.pb) {
            return fail(500, { error: 'PocketBase not initialized' });
        }

        const ref = parseStorageRef(params.ref);

        if (ref.type === 'local') {
            return fail(400, { error: 'Cannot manage items for local bars' });
        }
        const bar = await locals.pb.collection('bars').getFirstListItem(`slug="${ref.key}"`);

        const formData = await request.formData();
        const data = {
            bar: bar.id,
            key: formData.get('key')?.toString() || '',
            name: formData.get('name')?.toString() || '',
            pricing: formData.get('pricing')?.toString()
                ? JSON.parse(formData.get('pricing')!.toString())
                : {}
        };

        const validationResult = validate('barOfferItem', data);

        if (!validationResult.valid) {
            return fail(400, {
                data,
                errors: getFieldErrors(validationResult.errors || []),
                action: 'create'
            });
        }

        try {
            await locals.pb.collection('bar_offer_items').create(validationResult.data as any);
            return { success: true, action: 'create' };
        } catch (err: any) {
            if (err.status === 400 && err.data?.data) {
                const pbErrors: Record<string, string> = {};
                for (const [field, fieldError] of Object.entries(err.data.data)) {
                    pbErrors[field] = (fieldError as any).message;
                }
                return fail(400, { data, errors: pbErrors, action: 'create' });
            }
            throw err;
        }
    },

    update: async ({ request, params, locals }) => {
        if (!locals.pb) {
            return fail(500, { error: 'PocketBase not initialized' });
        }

        const ref = parseStorageRef(params.ref);

        if (ref.type === 'local') {
            return fail(400, { error: 'Cannot manage items for local bars' });
        }
        const bar = await locals.pb.collection('bars').getFirstListItem(`slug="${ref.key}"`);

        const formData = await request.formData();
        const itemId = formData.get('itemId')?.toString();

        if (!itemId) {
            return fail(400, { error: 'Item ID is required' });
        }

        const data = {
            bar: bar.id,
            key: formData.get('key')?.toString() || '',
            name: formData.get('name')?.toString() || '',
            pricing: formData.get('pricing')?.toString()
                ? JSON.parse(formData.get('pricing')!.toString())
                : {}
        };

        const validationResult = validate('barOfferItem', data);

        if (!validationResult.valid) {
            return fail(400, {
                data: { ...data, itemId },
                errors: getFieldErrors(validationResult.errors || []),
                action: 'update'
            });
        }

        try {
            await locals.pb.collection('bar_offer_items').update(itemId, validationResult.data as any);
            return { success: true, action: 'update' };
        } catch (err: any) {
            if (err.status === 400 && err.data?.data) {
                const pbErrors: Record<string, string> = {};
                for (const [field, fieldError] of Object.entries(err.data.data)) {
                    pbErrors[field] = (fieldError as any).message;
                }
                return fail(400, { data: { ...data, itemId }, errors: pbErrors, action: 'update' });
            }
            throw err;
        }
    },

    delete: async ({ request, locals }) => {
        if (!locals.pb) {
            return fail(500, { error: 'PocketBase not initialized' });
        }

        const formData = await request.formData();
        const itemId = formData.get('itemId')?.toString();

        if (!itemId) {
            return fail(400, { error: 'Item ID is required' });
        }

        try {
            await locals.pb.collection('bar_offer_items').delete(itemId);
            return { success: true, action: 'delete' };
        } catch (error) {
            return fail(500, { error: 'Failed to delete item' });
        }
    }
};
