import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isValidMapping, type TagMapping } from '$lib/bar/tags';
import { validate } from '$lib/validation/validator';
import { ensureUser } from '$lib/acl.server';

export const GET: RequestHandler = async ({ params, locals }) => {
    ensureUser(locals, ['bar-manager']);
    const ref = params.ref;

    try {
        const bar = await locals.pb
            .collection('bars')
            .getFirstListItem(`slug="${ref}"`);

        const mappings = await locals.pb.collection('bar_member_mappings').getFullList({
            filter: `member.bar="${bar.id}"`,
            expand: 'member',
            sort: 'member.seq',
        });

        const result = mappings
            .map((mapping): TagMapping => ({
                serialId: mapping.serialId,
                userId: String(mapping.expand?.member?.id || ''),
                nickName: mapping.expand?.member?.nickName || '',
                extra: {
                    seq: String(mapping.expand?.member?.seq || ''),
                    greeting: mapping.expand?.member?.greeting,
                    avatar_1x1: String(mapping.expand?.member?.avatar_1x1 || ''),
                },
            }))
            .filter((mapping) => isValidMapping(mapping))

        return json(result);
    } catch (err: any) {
        if (err.status === 404) {
            throw error(404, 'Bar not found');
        }
        throw error(500, 'Failed to load mappings');
    }
};

export const POST: RequestHandler = async ({ request, params, locals }) => {
    ensureUser(locals, ['bar-manager']);
    const ref = params.ref;

    const validationResult = validate<TagMapping>('barMemberMapping', await request.json());

    if (!validationResult.valid) {
        const errorMessages = validationResult.errors?.map(e => `${e.field}: ${e.message}`).join(', ');
        throw error(400, `Validation failed: ${errorMessages}`);
    }

    const { serialId, userId, nickName } = validationResult.data;

    try {
        const bar = await locals.pb
            .collection('bars')
            .getFirstListItem(`slug="${ref}" || id="${ref}"`);

        let member;
        try {
            member = await locals.pb
                .collection('bar_members')
                .getFirstListItem(`bar="${bar.id}" && nickName="${nickName}"`);
        } catch (err: any) {
            if (err.status === 404) {
                const members = await locals.pb.collection('bar_members').getFullList({
                    filter: `bar="${bar.id}"`,
                    sort: '-seq'
                });
                const nextSeq = members.length > 0 ? members[0].seq + 1 : 1;

                member = await locals.pb.collection('bar_members').create({
                    bar: bar.id,
                    nickName,
                    seq: nextSeq
                });
            } else {
                throw err;
            }
        }

        try {
            const existing = await locals.pb
                .collection('bar_member_mappings')
                .getFirstListItem(`serialId="${serialId}"`);

            const updated = await locals.pb.collection('bar_member_mappings')
                .update(existing.id, {
                    member: member.id,
                    serialId,
                })

            return json({
                serialId,
                userId: member.id,
                nickName: member.nickName
            } satisfies TagMapping);
        } catch (err: any) {
            if (err.status === 404) {
                await locals.pb.collection('bar_member_mappings').create({
                    serialId,
                    member: member.id
                });

                return json({
                    serialId,
                    userId: member.id,
                    nickName: member.nickName
                });
            }
            throw err;
        }
    } catch (err: any) {
        if (err.status === 404) {
            throw error(404, 'Bar not found');
        }
        throw error(500, 'Failed to create mapping');
    }
};

/**
 * Unmaps one card. The member stays — a lost card is not a lost tab, and the person it
 * belonged to still has a history and a badge number.
 */
export const DELETE: RequestHandler = async ({ url, params, locals }) => {
    ensureUser(locals, ['bar-manager']);
    const ref = params.ref;

    const serialId = url.searchParams.get('serialId');
    if (!serialId) {
        throw error(400, 'serialId is required');
    }

    let bar;
    try {
        bar = await locals.pb
            .collection('bars')
            .getFirstListItem(`slug="${ref}" || id="${ref}"`);
    } catch (err: any) {
        if (err.status === 404) throw error(404, 'Bar not found');
        throw error(500, 'Failed to delete mapping');
    }

    // Scoped through the member so one bar's manager cannot unmap another bar's card.
    const mapping = await locals.pb
        .collection('bar_member_mappings')
        .getFirstListItem(
            locals.pb.filter('member.bar = {:bar} && serialId = {:serialId}', {
                bar: bar.id,
                serialId,
            }),
        )
        .catch(() => null);

    if (!mapping) {
        throw error(404, 'Mapping not found');
    }

    await locals.pb.collection('bar_member_mappings').delete(mapping.id);

    return json({ serialId });
};
