import type { BarOfferItem } from '$lib/bar/BarModel';
import { formatPbError } from '$lib/db.server';
import { SERVING_PRESETS, DEFAULT_SERVING_PRESET, type ServingPresetKey } from '$lib/bar/servings';
import { validate, getFieldErrors } from '$lib/validation/validator';
import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, locals }) => {
    // Only the items — the bar itself comes from the section layout. The actions below
    // still fetch it themselves; actions have no `parent()`.
    const items = await locals.pb.collection<BarOfferItem>('bar_offer_items').getFullList({
        filter: `bar.slug = "${params.ref}"`,
        sort: 'name'
    });

    return { items };
};

export const actions: Actions = {
    create: async ({ request, params, locals }) => {
        const ref = params.ref;

        const bar = await locals.pb.collection('bars').getFirstListItem(`slug="${ref}"`);

        const formData = await request.formData();
        const data = {
            bar: bar.id,
            key: formData.get('key')?.toString() || '',
            name: formData.get('name')?.toString() || '',
            ...parseOfferData(formData),
        };

        const validationResult = validate<BarOfferItem>('barOfferItem', data);

        if (!validationResult.valid) {
            return fail(400, {
                data,
                errors: getFieldErrors(validationResult.errors || []),
                action: 'create'
            });
        }

        try {
            await locals.pb.collection('bar_offer_items').create(validationResult.data);
            return { success: true, action: 'create' };
        } catch (err) {
            const formattedError = formatPbError(err)
            if (formattedError) return fail(400, formattedError);

            throw err;
        }
    },

    update: async ({ request, params, locals }) => {
        const ref = params.ref;

        const bar = await locals.pb.collection('bars').getFirstListItem(`slug="${ref}"`);

        const formData = await request.formData();
        const itemId = formData.get('itemId')?.toString();

        if (!itemId) {
            return fail(400, { error: 'Item ID is required' });
        }

        const data = {
            bar: bar.id,
            key: formData.get('key')?.toString() || '',
            name: formData.get('name')?.toString() || '',
            ...parseOfferData(formData),
        };

        const validationResult = validate<BarOfferItem>('barOfferItem', data);

        if (!validationResult.valid) {
            return fail(400, {
                data: { ...data, itemId },
                errors: getFieldErrors(validationResult.errors || []),
                action: 'update'
            });
        }

        try {
            await locals.pb.collection('bar_offer_items').update(itemId, validationResult.data);
            return { success: true, action: 'update' };
        } catch (err) {
            const formattedError = formatPbError(err)
            if (formattedError) return fail(400, formattedError);

            throw err;
        }
    },

    delete: async ({ request, locals }) => {
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

function parseOfferData(formData: FormData) {
    // The preset decides which servings exist; anything the form didn't offer can't be priced.
    // An unrecognised preset falls back rather than failing here — AJV is the real gate.
    const requested = formData.get('servingPreset')?.toString() ?? '';
    const preset = SERVING_PRESETS[requested as ServingPresetKey]
        ?? SERVING_PRESETS[DEFAULT_SERVING_PRESET];

    const pricing: Record<string, number> = {};
    for (const serving of preset.servings) {
        const raw = formData.get(`price_${serving.key}`)?.toString()?.trim();
        if (!raw) continue;

        const price = Number(raw);
        if (Number.isFinite(price) && price >= 0) {
            pricing[serving.key] = price;
        }
    }

    return { servingPreset: preset.key, pricing };
}
