import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { parseStorageRef } from '$lib/bar/refs';
import type { BarOrderItem } from '$lib/bar/BarModel';

export const POST: RequestHandler = async ({ request, params, locals }) => {
    if (!locals.pb) {
        throw error(500, 'PocketBase not initialized');
    }

    const ref = parseStorageRef(params.ref);

    if (ref.type === 'local') {
        return json({ success: true, message: 'Local bar - no persistence' });
    }

    try {
        const { userId, items } = await request.json();

        if (!userId || !Array.isArray(items)) {
            throw error(400, 'Invalid request body: userId and items array required');
        }

        if (items.length === 0) {
            throw error(400, 'Cannot create order with no items');
        }

        // Validate items
        for (const item of items) {
            if (!item.key || !item.variant) {
                throw error(400, `Invalid item: ${JSON.stringify(item)} - key and variant required`);
            }
        }

        // Get the bar
        const bar = await locals.pb.collection('bars')
            .getFirstListItem(`slug="${ref.key}"`);

        // Get or create the customer by seq number
        let customer;
        try {
            customer = await locals.pb.collection('bar_members')
                .getFirstListItem(`bar.id = "${bar.id}" && seq = ${userId}`);
        } catch {
            // Customer doesn't exist, use the userId as seq and nickName
            customer = await locals.pb.collection('bar_members')
                .create({
                    bar: bar.id,
                    seq: parseInt(userId),
                    nickName: `User ${userId}`, // Default nickname - should be updated via mapper
                });
        }

        // Create order items in the database
        const createdItems = [];
        for (const item of items) {
            try {
                const orderItem = await locals.pb.collection<BarOrderItem>('bar_order_items')
                    .create({
                        customer: customer.id,
                        key: item.key,
                        variant: String(item.variant).toLowerCase(), // Ensure lowercase
                    });
                createdItems.push(orderItem);
            } catch (itemErr: any) {
                console.error('Error creating item:', itemErr);
                console.error('Item data:', { customer: customer.id, key: item.key, variant: item.variant });
                if (itemErr.response?.data) {
                    console.error('Validation errors:', itemErr.response.data);
                }
                throw itemErr;
            }
        }

        return json({
            success: true,
            items: createdItems,
            message: `Created ${createdItems.length} order items`
        });
    } catch (err: any) {
        console.error('Error creating order:', err);
        if (err.response?.data) {
            console.error('Error details:', err.response.data);
        }
        throw error(500, err.message || 'Failed to create order');
    }
};
