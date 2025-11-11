import { loadBarData } from "$lib/bar/storage.server";
import { FIXME_DEBUGGING_CREATE_DB_FROM_ENV } from "$lib/db.server";
import type { PageServerLoad, Actions } from "./$types";
import { fail } from "@sveltejs/kit";
import type { BarOrderItem } from "$lib/bar/BarModel";

export const load: PageServerLoad = async ({ params }) => {
    const db = await FIXME_DEBUGGING_CREATE_DB_FROM_ENV()
    const data = await loadBarData(db, params['ref'])

    return {
        ...data,
    };
}

export const actions: Actions = {
    createOrder: async ({ request, params, locals }) => {
        const pb = locals.pb || await FIXME_DEBUGGING_CREATE_DB_FROM_ENV();
        
        const formData = await request.formData();
        const userId = formData.get('userId')?.toString();
        const itemsJson = formData.get('items')?.toString();

        if (!userId || !itemsJson) {
            return fail(400, { error: 'Missing userId or items' });
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
            console.log('[createOrder] Starting order creation for userId:', userId, 'items:', items);
            
            // Get the bar
            const bar = await pb.collection('bars')
                .getFirstListItem(`slug="${params.ref}"`);
            
            console.log('[createOrder] Found bar:', bar.id, bar.slug);

            // Get or create the customer
            let customer;
            try {
                customer = await pb.collection('bar_members')
                    .getFirstListItem(`bar.id = "${bar.id}" && seq = ${userId}`);
                console.log('[createOrder] Found existing customer:', customer.id);
            } catch (findErr) {
                console.log('[createOrder] Customer not found, creating new one');
                try {
                    customer = await pb.collection('bar_members')
                        .create({
                            bar: bar.id,
                            seq: parseInt(userId),
                            nickName: `User ${userId}`,
                        });
                    console.log('[createOrder] Created new customer:', customer.id);
                } catch (createErr: any) {
                    console.error('[createOrder] Failed to create customer:', createErr);
                    console.error('[createOrder] Error details:', createErr.response?.data);
                    return fail(500, { error: `Failed to create customer: ${createErr.message}`, details: createErr.response?.data });
                }
            }

            // Helper function to normalize variant names to be database-compatible
            function normalizeVariant(variant: string): string {
                return variant
                    .toLowerCase()
                    .normalize('NFD') // Decompose diacritics
                    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
                    .replace(/[^a-z0-9]/g, ''); // Remove non-alphanumeric
            }

            // Create order items
            const createdItems = [];
            for (const item of items) {
                const normalizedVariant = normalizeVariant(item.variant);
                console.log('[createOrder] Creating order item:', { 
                    customer: customer.id, 
                    key: item.key, 
                    variant: item.variant,
                    normalizedVariant 
                });
                try {
                    const orderItem = await pb.collection<BarOrderItem>('bar_order_items')
                        .create({
                            customer: customer.id,
                            key: item.key,
                            variant: normalizedVariant,
                        });
                    createdItems.push(orderItem);
                    console.log('[createOrder] Created order item');
                } catch (itemErr: any) {
                    console.error('[createOrder] Failed to create order item:', itemErr);
                    console.error('[createOrder] Item error details:', itemErr.response?.data);
                    return fail(500, { error: `Failed to create order item: ${itemErr.message}`, details: itemErr.response?.data });
                }
            }

            console.log('[createOrder] Successfully created', createdItems.length, 'order items');
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
