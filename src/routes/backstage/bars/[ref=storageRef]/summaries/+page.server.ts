import type { Bar } from '$lib/bar/BarModel';
import { parseStorageRef } from '$lib/bar/refs';
import { getMemberStanding, getMemberSummaries } from '$lib/bar/stats/memberSummaries';
import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, locals }) => {
    if (!locals.pb) {
        throw new Error('PocketBase not initialized');
    }

    const ref = parseStorageRef(params.ref);

    if (ref.type === 'local' || ref.key === 'new') {
        throw new Error('Cannot view summaries for this bar');
    }

    const bar = await locals.pb.collection<Bar>('bars')
        .getFirstListItem(`slug="${ref.key}"`);

    const summaries = await getMemberSummaries(locals.pb, { slug: bar.slug });

    return { ref, bar, summaries };
};

export const actions: Actions = {
    settleMember: async ({ request, params, locals }) => {
        if (!locals.pb) {
            return fail(500, { error: 'PocketBase not initialized' });
        }

        const ref = parseStorageRef(params.ref);
        if (ref.type === 'local' || ref.key === 'new') {
            return fail(400, { error: 'Cannot create events for this bar' });
        }

        const formData = await request.formData();
        const memberId = formData.get('memberId')?.toString();
        const amountPaid = parseFloat(formData.get('amountPaid')?.toString() || '0');

        if (!memberId) {
            return fail(400, { error: 'Member is required' });
        }

        if (isNaN(amountPaid) || amountPaid <= 0) {
            return fail(400, { error: 'Valid amount is required' });
        }

        const memberStanding = await getMemberStanding(locals.pb, { slug: ref.key }, { id: memberId });
        const expectedAmount = memberStanding.amountDue;

        if (Math.abs(amountPaid - expectedAmount) > 0.01) {
            return fail(400, {
                error: `Amount paid (${amountPaid.toFixed(2)} Kč) does not match expected amount (${expectedAmount.toFixed(2)} Kč). Please verify the amount.`
            });
        }

        try {
            await locals.pb.collection('events').create({
                type: 'member-settled',
                target: `bar:${ref.key}`,
                data: {
                    member: memberId,
                    amountPaid,
                },
            });

            return { success: true, action: 'settleMember' };
        } catch (err) {
            return fail(500, { error: 'Failed to create settlement event' });
        }
    },
};
