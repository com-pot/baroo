import { packageState, type BarOfferItem, type BarOfferPackage, type PackageState } from '$lib/bar/BarModel';
import { ClientResponseError } from 'pocketbase';
import { formatPbError, type Db } from '$lib/db.server';
import { normalizeTag } from '$lib/bar/tags';
import { getFieldErrors, type ValidationError, type ValidationIssue } from '$lib/validation/validator';
import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { PICTURE_MAX_BYTES } from './offerItem';
import { isError, type AppError } from '$lib/errors';
import { barOfferItemSchema, barOfferPackageSchema } from '$lib/model/bar';
import * as m from '$lib/paraglide/messages.js';

export const load: PageServerLoad = async ({ params, locals, parent }) => {
    const { bar } = await parent()

    const [items, packages] = await Promise.all([
        locals.pb.collection<BarOfferItem>('bar_offer_items').getFullList({
            filter: `bar.slug = "${params.ref}"`,
            sort: 'name'
        }),
        locals.pb.collection<BarOfferPackage>('bar_offer_packages').getFullList({
            filter: locals.pb.filter('offerItem.bar.slug = {:slug}', { slug: params.ref }),
            fields: 'offerItem,unsealedAt,flushedAt',
        }).catch((err: unknown) => {
            // Until pb_schema.json is imported
            if (err instanceof ClientResponseError && err.status === 404) return [];
            throw err;
        }),
    ]);

    const packageCounts: Record<BarOfferItem["id"], Record<PackageState, number>> = {};
    for (const offerPackage of packages) {
        const counts = packageCounts[offerPackage.offerItem] ??= { registered: 0, unsealed: 0, flushed: 0 };
        counts[packageState(offerPackage)]++;
    }

    return { items, packageCounts, bar };
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
    },

    createPackage: async ({ request, params, locals }) => {
        const { pb } = locals;
        const bar = await pb.collection('bars').getFirstListItem(pb.filter('slug = {:slug}', { slug: params.ref }));

        const formData = await request.formData();
        const data = {
            offerItem: formData.get('offerItem')?.toString() || '',
            label: formData.get('label')?.toString().trim() || '',
            quantity: Number(formData.get('quantity')?.toString() || NaN),
            tagSerial: normalizeTag((formData.get('tagSerial')?.toString() ?? '').replaceAll(/[\s-]/g, '')),
        };

        const validationResult = barOfferPackageSchema.safeParse(data);
        if (!validationResult.success) {
            return fail(400, {
                data,
                errors: getFieldErrors(validationResult.error.issues),
                action: 'createPackage'
            });
        }

        const errors = await packageConflicts(pb, bar.id, validationResult.data);
        if (errors) {
            return fail(400, { data, errors, action: 'createPackage' });
        }

        try {
            await pb.collection('bar_offer_packages').create(validationResult.data);
            return { success: true, action: 'createPackage' };
        } catch (err) {
            const formattedError = formatPbError(err)
            if (formattedError) return fail(400, { ...formattedError, action: 'createPackage' });

            throw err;
        }
    },
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

function parseOfferData(formData: FormData): Pick<BarOfferItem, "measure" | "servings"> {
    let servings: BarOfferItem["servings"] = [];
    try {
        servings = JSON.parse(formData.get('servings')?.toString() || '[]');
    } catch {
        // Left for the schema to refuse
    }

    return {
        measure: (formData.get('measure')?.toString() ?? '') as BarOfferItem["measure"],
        servings,
    };
}

/** The package's item must be the bar's, and its tag no other package's still in use nor a member's card */
async function packageConflicts(
    pb: Db,
    barId: string,
    data: Pick<BarOfferPackage, 'offerItem' | 'tagSerial'>,
): Promise<Record<string, ValidationError[]> | null> {
    const item = await pb.collection<BarOfferItem>('bar_offer_items').getFirstListItem(
        pb.filter('id = {:id} && bar = {:bar}', { id: data.offerItem, bar: barId }),
    ).catch(() => null);
    if (!item) {
        return { offerItem: [{ field: 'offerItem', message: m["baroo.backstage.offer.package_item_unknown"]() }] };
    }

    if (!data.tagSerial) return null;

    // One tag, one package at a time - otherwise a TapTapper would unseal whichever it read last.
    // Once that one is flushed, the tag may go on a new one.
    const owner = await pb.collection<BarOfferPackage & { expand?: { offerItem?: BarOfferItem } }>('bar_offer_packages').getFirstListItem(
        pb.filter('offerItem.bar = {:bar} && tagSerial = {:tagSerial} && flushedAt = ""', {
            bar: barId,
            tagSerial: data.tagSerial,
        }),
        { expand: 'offerItem' },
    ).catch(() => null);
    if (owner) {
        const name = [owner.expand?.offerItem?.name, owner.label].filter(Boolean).join(' — ');
        return { tagSerial: [{ field: 'tagSerial', message: m["baroo.backstage.offer.tag_serial_taken"]({ name }) }] };
    }

    // A TapTapper takes a package tag for a package before it would take it for a card
    const card = await pb.collection('bar_member_mappings').getFirstListItem(
        pb.filter('member.bar = {:bar} && serialId = {:serialId}', { bar: barId, serialId: data.tagSerial }),
        { expand: 'member' },
    ).catch(() => null);
    if (card) {
        return { tagSerial: [{ field: 'tagSerial', message: m["baroo.backstage.offer.tag_serial_card"]({ name: card.expand?.member?.nickName ?? '' }) }] };
    }

    return null;
}
