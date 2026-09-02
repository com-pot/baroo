import type { BarOfferItem } from '$lib/bar/BarModel';
import { formatPbError } from '$lib/db.server';
import { SERVING_PRESETS, DEFAULT_SERVING_PRESET, type ServingPresetKey } from '$lib/bar/servings';
import { validate, getFieldErrors, type ValidationError } from '$lib/validation/validator';
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
        const picture = readPicture(formData);

        if (!validationResult.valid || 'error' in picture) {
            return fail(400, {
                data,
                errors: collectErrors(validationResult.errors, picture),
                action: 'create'
            });
        }

        try {
            await locals.pb.collection('bar_offer_items').create({
                ...validationResult.data,
                ...picture.file ? { preview_1x1: picture.file } : {},
            });
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
        const picture = readPicture(formData);

        if (!validationResult.valid || 'error' in picture) {
            return fail(400, {
                data: { ...data, itemId },
                errors: collectErrors(validationResult.errors, picture),
                action: 'update'
            });
        }

        try {
            // No picture in the payload leaves the stored one alone — PocketBase only
            // touches the fields it is given, which is what makes editing a name safe.
            await locals.pb.collection('bar_offer_items').update(itemId, {
                ...validationResult.data,
                ...picture.file ? { preview_1x1: picture.file } : {},
            });
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

/** Field errors from both gates in one map, the shape the form fields read. */
function collectErrors(
    schemaErrors: ValidationError[] | undefined,
    picture: PictureResult,
): Record<string, string> {
    const errors = getFieldErrors(schemaErrors || []);
    if ('error' in picture) errors.preview_1x1 = picture.error;

    return errors;
}

type PictureResult = { file: File | null } | { error: string };

/** What the kiosk's square frames are worth carrying over a venue's connection. */
const PICTURE_MAX_BYTES = 200_000;

/**
 * The uploaded picture, re-checked here.
 *
 * The drop zone already refused anything oversized or the wrong shape, but that runs in
 * the browser and this action is reachable without it. Aspect ratio is the one check not
 * repeated — it needs the image decoded, and nothing here can do that; a wrongly-shaped
 * picture is a cosmetic problem, unlike a 40 MB one.
 */
function readPicture(formData: FormData): PictureResult {
    const value = formData.get('preview_1x1');

    if (!(value instanceof File) || value.size === 0) return { file: null };

    if (!value.type.startsWith('image/')) {
        return { error: `Not an image: ${value.type || 'unknown type'}` };
    }

    if (value.size > PICTURE_MAX_BYTES) {
        return { error: `Picture is ${value.size} B; the limit is ${PICTURE_MAX_BYTES} B` };
    }

    return { file: value };
}

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
