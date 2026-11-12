import { barDoUnseal, type UnsealEvent } from '$lib/bar/ops/unseal';
import { barDoFlush, type ClosureData, type FlushEvent } from '$lib/bar/ops/flush';
import { effectiveDate } from '$lib/bar/BarModel';
import { formatPbError } from '$lib/db.server';
import { barSchema } from '$lib/model/bar';
import { getFieldErrors } from '$lib/validation/validator';
import z from 'zod';
import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import getSnapshot from '$lib/bar/snapshot/getSnapshot';
import { broadcastTaps, tapStates } from '$lib/taps/tapBoard.server';
import { tapRefSchema } from '$lib/taps/tapEvents';

export const load: PageServerLoad = async ({ parent, locals }) => {
    const { bar } = await parent();
    if (!bar) return { snapshot: null, taps: [], closures: {} as Record<string, TapClosure[]> };

    const [snapshot, taps, closures] = await Promise.all([
        getSnapshot(locals, bar.slug),
        tapStates(locals.pb, bar.slug),
        tapClosures(locals, bar.slug),
    ]);

    return { snapshot, taps, closures };
};

export type TapClosure = { closure: ClosureData; closedAt: string };

/** What got closed on each tap: its flushes, and the unseals from before flushes that carried it, latest first */
async function tapClosures(locals: App.Locals, barSlug: string): Promise<Record<string, TapClosure[]>> {
    const events = await locals.pb.collection<UnsealEvent | FlushEvent>('events').getFullList({
        filter: locals.pb.filter('target = {:target} && (type = "flush" || (type = "unseal" && data.closureData != null)) && data.tap != null', {
            target: `bar:${barSlug}`,
        }),
        sort: '-occurredAt,-created',
    });

    const byTap: Record<string, TapClosure[]> = {};
    for (const event of events) {
        const closure = event.data.closureData;
        if (!event.data.tap || !closure) continue;
        (byTap[event.data.tap] ??= []).push({ closure, closedAt: effectiveDate(event) });
    }

    return byTap;
}

const unsealFormSchema = z.object({
    offerItemKey: z.string().min(1),
    tap: z.union([z.literal(''), tapRefSchema]).transform((tap) => tap || null),
    packageId: z.string().transform((id) => id || null),
    quantity: z.coerce.number().gt(0).optional(),
    label: z.string().max(40).optional(),
}).refine((unseal) => unseal.packageId || unseal.quantity, { path: ['quantity'] })

const flushFormSchema = z.object({
    packageId: z.string().min(1),
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
            await barDoUnseal(locals, ref, { ...input.data, quantity: input.data.quantity ?? 0 })
            await tellTaps(locals, ref)

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
            await tellTaps(locals, ref)

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
            name: formData.get('name')?.toString() || '',
            currency: formData.get('currency')?.toString() || '',
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
            return { success: true, data: updatedBar };
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

/** The kiosks and TapTappers show it right away */
async function tellTaps(locals: App.Locals, barSlug: string): Promise<void> {
    await broadcastTaps(locals, locals.pb, barSlug).catch((err) => locals.logger.error(err, '[taps] could not tell what is on the taps'));
}
