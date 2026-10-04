import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { type TagMapping } from '$lib/bar/tags';
import { ensureUser } from '$lib/acl.server';
import { barMemberMappingSchema } from '$lib/model/bar';
import { loadBarTagMappings } from '$lib/bar/storage.server';

export const GET: RequestHandler = async ({ params, locals }) => {
    ensureUser(locals, ['bar-manager']);
    const mappings = await loadBarTagMappings(locals, params.ref)
    return json(mappings);
};

export const POST: RequestHandler = async ({ request, params, locals }) => {
    ensureUser(locals, ['bar-manager']);
    const ref = params.ref;

    const validationResult = barMemberMappingSchema.safeParse(await request.json());

    if (!validationResult.success) {
        throw error(400, {
            message: `Validation failed`,
            details: {
                issues: validationResult.error.issues,
            }
        });
    }

    const { serialId } = validationResult.data;
    const { nickName } = validationResult.data;

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
                member: {
                    id: member.id,
                    nickName: member.nickName,
                    seq: member.seq,
                },
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

export const DELETE: RequestHandler = async ({ url, params, locals }) => {
    ensureUser(locals, ['bar-manager']);
    const ref = params.ref;

    const serialId = url.searchParams.get('serialId');
    if (!serialId) {
        throw error(400, 'serialId is required');
    }

    const mapping = await locals.pb
        .collection('bar_member_mappings')
        .getFirstListItem(
            locals.pb.filter('member.bar.slug = {:bar} && serialId = {:serialId}', {
                bar: ref,
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
