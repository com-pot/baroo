import { barDoUnseal } from '$lib/bar/ops/unseal';
import { barDoFlush } from '$lib/bar/ops/flush';
import { formatPbError } from '$lib/db.server';
import { barSchema } from '$lib/model/bar';
import { getFieldErrors } from '$lib/validation/validator';
import z from 'zod';
import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import getSnapshot from '$lib/bar/snapshot/getSnapshot';
import { tapsEnabled } from '$lib/taps/tapAuth.server';
import { boardStock, broadcastTaps, learnSnapshot, tapStates } from '$lib/taps/tapBoard.server';
import { tapIdSchema } from '$lib/taps/tapEvents';

export const load: PageServerLoad = async ({ parent, locals }) => {
    const { bar } = await parent();
    if (!bar) return { snapshot: null, stock: [], taps: [], liveTaps: false };

    const snapshot = await getSnapshot(locals, bar.slug)

    // Fresh from PocketBase, so the venue server's taps learn from it too
    if (await learnSnapshot(locals, bar.slug, snapshot)) {
        void broadcastTaps(locals, bar.slug).catch((err) => locals.logger.error(err, '[taps] could not tell what is on the taps'));
    }

    return {
        snapshot,
        stock: await boardStock(locals, bar.slug, snapshot.offerItems),
        taps: await tapStates(locals, bar.slug),
        liveTaps: tapsEnabled(),
    };
};

const tapField = z.union([z.literal(''), tapIdSchema]).transform((tap) => tap || null);

const unsealFormSchema = z.object({
    offerItemKey: z.string().min(1),
    quantity: z.coerce.number().gt(0),
    tap: tapField,
    packageId: z.string().transform((id) => id || null),
    flushCurrent: z.literal('on').optional().transform((checked) => checked === 'on'),
})

const flushFormSchema = z.object({
    offerItemKey: z.string().min(1),
    tap: tapField,
})

export const actions: Actions = {
    unseal: async ({ request, params, locals }) => {
        const ref = params.ref;
        if (ref === 'new') {
            return fail(400, { error: 'Cannot create events for this bar' });
        }

        const input = unsealFormSchema.safeParse(Object.fromEntries(await request.formData()));
        if (!input.success) {
            return fail(400, { error: 'Invalid data', issues: input.error.issues });
        }

        try {
            await barDoUnseal(locals, ref, input.data)

            return { success: true, action: 'unseal' };
        } catch (err) {
            locals.logger.error(err, 'Failed to unseal');
            return fail(500, { error: 'Failed to unseal' });
        }
    },

    flush: async ({ request, params, locals }) => {
        const ref = params.ref;
        if (ref === 'new') {
            return fail(400, { error: 'Cannot create events for this bar' });
        }

        const input = flushFormSchema.safeParse(Object.fromEntries(await request.formData()));
        if (!input.success) {
            return fail(400, { error: 'Invalid data', issues: input.error.issues });
        }

        try {
            await barDoFlush(locals, ref, input.data)

            return { success: true, action: 'flush' };
        } catch (err) {
            locals.logger.error(err, 'Failed to flush');
            return fail(500, { error: 'Failed to flush' });
        }
    },

    save: async ({ request, params, locals }) => {
        const formData = await request.formData();
        const data = {
            slug: formData.get('slug')?.toString() || '',
            name: formData.get('name')?.toString() || ''
        };

        const validationResult = barSchema.safeParse(data);

        if (!validationResult.success) {
            return fail(400, {
                data,
                errors: getFieldErrors(validationResult.error.issues)
            });
        }

        const ref = params.ref;

        try {
            if (params.ref === 'new') {
                const bar = await locals.pb.collection('bars').create(validationResult.data);
                return redirect(303, `/backstage/bars/${bar.slug}`);
            }

            const bar = await locals.pb.collection('bars').getFirstListItem(`slug="${ref}"`);
            const updatedBar = await locals.pb.collection('bars').update(bar.id, validationResult.data);
            return { success: true, data: { slug: updatedBar.slug, name: updatedBar.name } };
        } catch (err) {
            const formattedError = formatPbError(err)
            if (formattedError) return fail(400, formattedError);

            throw err;
        }
    },

    delete: async ({ params, locals }) => {
        const ref = params.ref;
        if (ref === 'new') {
            return fail(400, { error: 'Cannot delete a new bar' });
        }

        try {
            await locals.pb.collection('bars').delete(ref);
        } catch (error) {
            return fail(500, { error: 'Failed to delete bar' });
        }

        return redirect(303, '/backstage/bars');
    }
};
