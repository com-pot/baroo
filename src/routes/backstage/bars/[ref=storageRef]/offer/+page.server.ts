import type { BarOfferItem } from '$lib/bar/BarModel';
import { parseStorageRef } from '$lib/bar/refs';
import { formatPbError } from '$lib/db.server';
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

// Helper function to normalize variant names for database storage
function normalizeVariant(variant: string): string {
    return variant
        .toLowerCase()
        .normalize('NFD') // Decompose diacritics
        .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
        .replace(/[^a-z0-9]/g, ''); // Remove non-alphanumeric
}

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
        
        // Build pricing object from variant fields with normalized keys
        // Also build variant labels mapping to preserve original display names
        // Also build variant volumes mapping to store ML values
        const pricing: Record<string, number> = {};
        const variantLabels: Record<string, string> = {};
        const variantVolumes: Record<string, number> = {};
        let index = 0;
        while (formData.has(`variant_name_${index}`)) {
            const variantName = formData.get(`variant_name_${index}`)?.toString()?.trim();
            const variantPrice = formData.get(`variant_price_${index}`)?.toString()?.trim();
            const variantVolume = formData.get(`variant_volume_${index}`)?.toString()?.trim();
            
            if (variantName && variantPrice) {
                // Normalize variant name for database compatibility
                const normalizedName = normalizeVariant(variantName);
                pricing[normalizedName] = parseFloat(variantPrice);
                // Store original label for display
                variantLabels[normalizedName] = variantName;
                // Store volume in ML if provided (check for non-empty string and valid number)
                if (variantVolume && variantVolume !== '') {
                    const volumeNum = parseFloat(variantVolume);
                    if (!isNaN(volumeNum) && volumeNum > 0) {
                        variantVolumes[normalizedName] = volumeNum;
                    }
                }
            }
            index++;
        }
        
        const data = {
            bar: bar.id,
            key: formData.get('key')?.toString() || '',
            name: formData.get('name')?.toString() || '',
            pricing,
            variantLabels, // Store original display labels
            variantVolumes // Store ML values for each variant
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

        // Build pricing object from variant fields with normalized keys
        // Also build variant labels mapping to preserve original display names
        // Also build variant volumes mapping to store ML values
        const pricing: Record<string, number> = {};
        const variantLabels: Record<string, string> = {};
        const variantVolumes: Record<string, number> = {};
        let index = 0;
        while (formData.has(`variant_name_${index}`)) {
            const variantName = formData.get(`variant_name_${index}`)?.toString()?.trim();
            const variantPrice = formData.get(`variant_price_${index}`)?.toString()?.trim();
            const variantVolume = formData.get(`variant_volume_${index}`)?.toString()?.trim();
            
            if (variantName && variantPrice) {
                // Normalize variant name for database compatibility
                const normalizedName = normalizeVariant(variantName);
                pricing[normalizedName] = parseFloat(variantPrice);
                // Store original label for display
                variantLabels[normalizedName] = variantName;
                // Store volume in ML if provided (check for non-empty string and valid number)
                if (variantVolume && variantVolume !== '') {
                    const volumeNum = parseFloat(variantVolume);
                    if (!isNaN(volumeNum) && volumeNum > 0) {
                        variantVolumes[normalizedName] = volumeNum;
                    }
                }
            }
            index++;
        }

        const data = {
            bar: bar.id,
            key: formData.get('key')?.toString() || '',
            name: formData.get('name')?.toString() || '',
            pricing,
            variantLabels, // Store original display labels
            variantVolumes // Store ML values for each variant
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
