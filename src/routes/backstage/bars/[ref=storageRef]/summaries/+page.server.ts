import type { Bar, BarMember } from '$lib/bar/BarModel';
import { plannedRowCount, planMemberImport, type MemberImportIssue, executeImportPlan } from '$lib/bar/memberImport';
import { getBarOfferIndex } from '$lib/bar/stats/barOfferItems';
import { getMemberStanding, getMemberSummaries } from '$lib/bar/stats/memberSummaries';
import { pbResponseErrorMessage } from '$lib/pocketbase';
import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ parent, locals }) => {
    const { bar } = await parent();
    if (!bar) {
        return error(404)
    }

    const barOffer = await getBarOfferIndex(locals.pb, bar)
    const summaries = await getMemberSummaries(locals.pb, bar, { barOffer });

    return { bar, barOffer, summaries };
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

    importMembers: async ({ request, params, locals }) => {
        const ref = params.ref;
        if (ref === 'new') {
            return fail(400, { action: 'importMembers' as const, issues: [] });
        }

        const formData = await request.formData();
        const pasted = formData.get('members')?.toString() ?? '';

        const bar = await locals.pb.collection<Bar>('bars').getFirstListItem(`slug="${ref}"`);
        const members = await locals.pb.collection<BarMember>('bar_members').getFullList({
            filter: locals.pb.filter('bar = {:bar}', { bar: bar.id }),
        });

        const plan = planMemberImport(pasted, members);

        if (plan.issues.length > 0 || plannedRowCount(plan) === 0) {
            return fail(400, { action: 'importMembers' as const, issues: plan.issues });
        }
        const planResult = await executeImportPlan(locals, bar, plan)

        if (planResult.issues.length > 0) {
            return fail(409, { action: 'importMembers' as const, ...planResult });
        }

        return {
            success: true,
            action: 'importMembers' as const,
            created: planResult.created,
            renamed: planResult.renamed,
            unchanged: plan.unchanged,
        };
    },
};

