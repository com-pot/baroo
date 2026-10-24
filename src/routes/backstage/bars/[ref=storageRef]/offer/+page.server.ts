import type { BarOfferItem } from '$lib/bar/BarModel';
import { formatPbError, type Db } from '$lib/db.server';
import { SERVING_PRESETS } from '$lib/bar/servings';
import { normalizeTag } from '$lib/bar/tags';
import { getFieldErrors, type ValidationError, type ValidationIssue } from '$lib/validation/validator';
import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { PICTURE_MAX_BYTES } from './offerItem';
import { isError, type AppError } from '$lib/errors';
import { barOfferItemSchema } from '$lib/model/bar';
import * as m from '$lib/paraglide/messages.js';

export const load: PageServerLoad = async ({ params, locals }) => {
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

        const validationResult = barOfferItemSchema.safeParse(data)
        const picture = readPicture(formData.get('preview_1x1'));

        if (!validationResult.success || isError(picture)) {
            return fail(400, {
                data,
                errors: collectErrors(validationResult.error?.issues, picture),
                action: 'create'
            });
        }

        const tagSerialOwner = await findTagSerialOwner(locals.pb, bar.id, data.tagSerial);
        if (tagSerialOwner) {
            return fail(400, {
                data,
                errors: tagSerialTakenErrors(tagSerialOwner),
                action: 'create'
            });
        }

        try {
            await locals.pb.collection('bar_offer_items').create({
                ...validationResult.data,
                ...('error' in picture || !picture.file ? {} : { preview_1x1: picture.file }),
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

        const validationResult = barOfferItemSchema.safeParse(data)
        const picture = readPicture(formData.get('preview_1x1'));

        if (!validationResult.success || isError(picture)) {
            return fail(400, {
                data: { ...data, itemId },
                errors: collectErrors(validationResult.error?.issues, picture),
                action: 'update'
            });
        }

        const tagSerialOwner = await findTagSerialOwner(locals.pb, bar.id, data.tagSerial, itemId);
        if (tagSerialOwner) {
            return fail(400, {
                data: { ...data, itemId },
                errors: tagSerialTakenErrors(tagSerialOwner),
                action: 'update'
            });
        }

        try {
            await locals.pb.collection('bar_offer_items').update(itemId, {
                ...validationResult.data,
                ...('error' in picture || !picture.file ? {} : { preview_1x1: picture.file }),
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

function collectErrors(
    schemaErrors: ValidationIssue[] | undefined,
    picture: ReturnType<typeof readPicture>,
): ReturnType<typeof getFieldErrors> {
    const errors = getFieldErrors(schemaErrors || []);
    if (isError(picture)) errors.preview_1x1 = [{ field: "preview_1x1", message: picture.error }];

    return errors;
}

type PictureResult = { file: File | null };

function readPicture(value: FormDataEntryValue | null): PictureResult | AppError {
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
    const requested = formData.get('servingPreset')?.toString() ?? '';
    const preset = SERVING_PRESETS.index[requested as keyof typeof SERVING_PRESETS["index"]]
    if (!preset) {
        throw new Error("invalid-value servingPreset")
    }

    const pricing: Record<string, number> = {};
    for (const serving of preset.servings) {
        const key = `pricing.${serving.key}`
        const raw = formData.get(key)?.toString()?.trim();
        if (!raw) continue;

        const price = Number(raw);
        if (Number.isFinite(price) && price >= 0) {
            pricing[serving.key] = price;
        }
    }

    return {
        servingPreset: preset.key,
        pricing,
        tagSerial: normalizeTag((formData.get('tagSerial')?.toString() ?? '').replaceAll(/[\s-]/g, '')),
    };
}

function tagSerialTakenErrors(owner: BarOfferItem): Record<string, ValidationError[]> {
    return {
        tagSerial: [{ field: 'tagSerial', message: m["baroo.backstage.offer.tag_serial_taken"]({ name: owner.name }) }],
    };
}

/** One tag, one drink - otherwise a spigot would pour whichever item it read last */
async function findTagSerialOwner(
    pb: Db,
    barId: string,
    tagSerial: string,
    exceptItemId?: string,
): Promise<BarOfferItem | null> {
    if (!tagSerial) return null;

    return pb.collection<BarOfferItem>('bar_offer_items').getFirstListItem(
        pb.filter('bar = {:bar} && tagSerial = {:tagSerial} && id != {:itemId}', {
            bar: barId,
            tagSerial,
            itemId: exceptItemId ?? '',
        }),
    ).catch(() => null);
}
