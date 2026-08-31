import type { Bar } from '$lib/bar/BarModel';
import { getBarOfferIndex } from '$lib/bar/stats/barOfferItems';
import { getMemberStanding, getMemberSummaries } from '$lib/bar/stats/memberSummaries';
import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ parent, locals }) => {
    // The bar (and the `new` 404) come from the section layout.
    const { bar } = await parent();

    const barOffer = await getBarOfferIndex(locals.pb, bar!)

    const summaries = await getMemberSummaries(locals.pb, { slug: bar!.slug });

    return { barOffer, summaries };
};

export const actions: Actions = {
    settleMember: async ({ request, params, locals }) => {
        const ref = params.ref;
        if (ref === 'new') {
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

        const memberStanding = await getMemberStanding(locals.pb, { slug: ref }, { id: memberId });
        const amountDue = memberStanding.amountDue;

        if (amountPaid < amountDue) {
            return fail(400, {
                error: `Amount paid (${amountPaid.toFixed(2)} Kč) does not match expected amount (${amountDue.toFixed(2)} Kč). Please verify the amount.`
            });
        }

        try {
            await locals.pb.collection('events').create({
                type: 'member-settled',
                target: `bar:${ref}`,
                occurredAt: new Date().toISOString(),
                data: {
                    member: memberId,
                    amountDue: amountDue,
                    amountPaid,
                },
            });

            return { success: true, action: 'settleMember' };
        } catch (err) {
            return fail(500, { error: 'Failed to create settlement event' });
        }
    },
};
