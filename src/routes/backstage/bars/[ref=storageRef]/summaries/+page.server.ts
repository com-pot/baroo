import type { Bar, BarMember } from '$lib/bar/BarModel';
import { plannedRowCount, planMemberImport, type MemberImportIssue } from '$lib/bar/memberImport';
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

    /**
     * Upserts members from a block pasted out of a spreadsheet, keyed by member number.
     *
     * Nothing is written until every row checks out: the barman gets the whole paste back
     * with the bad rows called out, rather than half an import to reconcile by hand.
     */
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

        const issues: MemberImportIssue[] = [];
        let created = 0;
        let renamed = 0;

        for (const row of plan.creates) {
            try {
                await locals.pb.collection<BarMember>('bar_members').create({
                    bar: bar.id,
                    nickName: row.nickName,
                    seq: row.seq,
                });
                created++;
            } catch (err) {
                issues.push({ lineNo: row.lineNo, raw: row.raw, reason: writeFailed(err) });
            }
        }

        for (const row of plan.renames) {
            try {
                await locals.pb.collection<BarMember>('bar_members').update(row.id, {
                    nickName: row.nickName,
                });
                renamed++;
            } catch (err) {
                issues.push({ lineNo: row.lineNo, raw: row.raw, reason: writeFailed(err) });
            }
        }

        // A write can still lose a race with another manager. Whatever landed stays — the
        // report says how much of the paste got through so the retry isn't a guess.
        if (issues.length > 0) {
            return fail(409, { action: 'importMembers' as const, issues, created, renamed });
        }

        return {
            success: true,
            action: 'importMembers' as const,
            created,
            renamed,
            unchanged: plan.unchanged,
        };
    },
};

/** PocketBase hides the useful part of a write error one level down. */
function writeFailed(err: unknown): MemberImportIssue['reason'] {
    const response = (err as { response?: { message?: string } })?.response;
    const message = response?.message || (err instanceof Error ? err.message : String(err));
    return { code: 'write_failed', message };
}
