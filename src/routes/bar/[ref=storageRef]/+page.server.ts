import { loadBarData } from "$lib/bar/storage.server";
import { FIXME_DEBUGGING_CREATE_DB_FROM_ENV, useStorage } from "$lib/db.server";
import type { PageServerLoad, Actions } from "./$types";
import { fail } from "@sveltejs/kit";
import type { Bar, BarOrderItem } from "$lib/bar/BarModel";
import { createSlug } from "$lib/strings";

export const load: PageServerLoad = async ({ params }) => {
    const db = await FIXME_DEBUGGING_CREATE_DB_FROM_ENV()
    const storage = useStorage()
    const data = await loadBarData(db, params['ref'])

    return {
        ...data,
        storage,
    };
}

export const actions: Actions = {
    createOrder: async ({ request, params, locals }) => {
        const pb = locals.pb || await FIXME_DEBUGGING_CREATE_DB_FROM_ENV();

        const formData = await request.formData();
        const serialId = formData.get('serialId')?.toString();
        const itemsJson = formData.get('items')?.toString();

        if (!serialId || !itemsJson) {
            return fail(400, { error: 'Missing serialId or items' });
        }

        let items;
        try {
            items = JSON.parse(itemsJson);
        } catch {
            return fail(400, { error: 'Invalid items JSON' });
        }

        if (!Array.isArray(items) || items.length === 0) {
            return fail(400, { error: 'Items must be a non-empty array' });
        }

        try {
            const bar = await pb.collection<Bar>('bars')
                .getFirstListItem(`slug="${params.ref}"`);

            const mapping = await pb.collection('bar_member_mappings')
                .getFirstListItem(`member.bar="${bar.id}" && serialId="${serialId}"`);

            const customer = await pb.collection('bar_members')
                .getFirstListItem(`bar.id = "${bar.id}" && id = "${mapping.member}"`);

            const createdItems = [];
            for (const item of items) {
                const normalizedVariant = createSlug(item.variant);

                try {
                    const orderItem = await pb.collection<BarOrderItem>('bar_order_items')
                        .create({
                            customer: customer.id,
                            key: item.key,
                            variant: normalizedVariant,
                        });
                    createdItems.push(orderItem);
                } catch (itemErr: any) {
                    console.error('[createOrder] Failed to create order item:', itemErr);
                    console.error('[createOrder] Item error details:', itemErr.response?.data);
                    return fail(500, { error: `Failed to create order item: ${itemErr.message}`, details: itemErr.response?.data });
                }
            }

            return {
                success: true,
                itemCount: createdItems.length
            };
        } catch (err: any) {
            console.error('[createOrder] Unexpected error:', err);
            console.error('[createOrder] Error stack:', err.stack);
            return fail(500, { error: err.message || 'Failed to create order', details: err.response?.data });
        }
    }
};
