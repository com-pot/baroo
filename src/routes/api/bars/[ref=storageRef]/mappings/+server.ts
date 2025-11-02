import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { parseStorageRef } from '$lib/bar/refs';
import { isValidMapping, type TagMapping } from '$lib/bar/tags';
import { validate } from '$lib/validation/validator';

export const GET: RequestHandler = async ({ params, locals }) => {
    const ref = parseStorageRef(params.ref);

    if (ref.type === 'local') {
        return json({ error: 'unsupported-type' }, { status: 400 });
    }

    if (!locals.pb) {
        throw error(500, 'PocketBase not initialized');
    }

    try {
        const bar = await locals.pb
            .collection('bars')
            .getFirstListItem(`slug="${ref.key}"`);

        const mappings = await locals.pb.collection('bar_member_mappings').getFullList({
            filter: `member.bar="${bar.id}"`,
            expand: 'member',
            sort: 'created'
        });

        const result = mappings
            .map((mapping): TagMapping => ({
                tag: mapping.serialId,
                userId: mapping.expand?.member?.id || '',
                nickName: mapping.expand?.member?.nickName || ''
            }))
            .filter((mapping) => isValidMapping(mapping));

        return json(result);
    } catch (err: any) {
        if (err.status === 404) {
            throw error(404, 'Bar not found');
        }
        throw error(500, 'Failed to load mappings');
    }
};

export const POST: RequestHandler = async ({ request, params, locals }) => {
    const ref = parseStorageRef(params.ref);

    if (ref.type === 'local') {
        throw error(400, 'Cannot create mappings for local bars via API');
    }

    if (!locals.pb) {
        throw error(500, 'PocketBase not initialized');
    }

    const validationResult = validate<{ tag: string; userId: string; nickName: string }>('barMemberMapping', await request.json());

    if (!validationResult.valid) {
        const errorMessages = validationResult.errors?.map(e => `${e.field}: ${e.message}`).join(', ');
        throw error(400, `Validation failed: ${errorMessages}`);
    }

    const { tag, userId, nickName } = validationResult.data;

    try {
        const bar = await locals.pb
            .collection('bars')
            .getFirstListItem(`slug="${ref.key}" || id="${ref.key}"`);

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
                .getFirstListItem(`serialId="${tag}"`);

            const updated = await locals.pb.collection('bar_member_mappings').update(existing.id, {
                member: member.id,
                serialId: tag
            });

            return json({
                tag,
                userId: member.id,
                nickName: member.nickName
            });
        } catch (err: any) {
            if (err.status === 404) {
                await locals.pb.collection('bar_member_mappings').create({
                    serialId: tag,
                    member: member.id
                });

                return json({
                    tag,
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
