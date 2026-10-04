import type { Db } from '$lib/db.server';

import type { Bar, BarMember } from '$lib/bar/BarModel';
import { readPosConfig, type PosDevice } from '$lib/pos/device';
import { serverMemberId, type BarOp, type OrderOp, type OutboxOp } from '$lib/offline/op';
import type { SyncOpResult } from '$lib/offline/sync';
import { barDoUnseal } from '$lib/bar/ops/unseal';

type Ctx = { pb: Db; bar: Bar; device: PosDevice };

export function applyOp(ctx: Ctx, op: OutboxOp): Promise<SyncOpResult> {
    const opBody = opMap[op.kind] as unknown as (ctx: Ctx, op: OutboxOp) => Promise<SyncOpResult>
    if (opBody) {
        return opBody(ctx, op)
    }

    throw new Error(`unknown op kind: ${(op as OutboxOp).kind}`);
}

const opMap: {
    [Kind in OutboxOp["kind"]]: (ctx: Ctx, op: OutboxOp & BarOp & { kind: Kind }) => Promise<SyncOpResult>;
} = {
    'order': async (ctx, op) => {
        const { pb } = ctx
        const customer = await resolveOrderCustomer(ctx, op);

        const existing = await pb.collection('bar_order_items').getFullList({
            filter: pb.filter('clientId ~ {:clientId}', { clientId: op.clientId }),
        });
        const done = new Set(existing.map(row => row.clientId));

        let written = 0;
        for (const [index, item] of op.items.entries()) {
            const clientId = `${op.clientId}#${index}`;
            if (done.has(clientId)) continue;

            await pb.collection('bar_order_items').create({
                customer,
                key: item.key,
                variant: item.variant,
                orderedAt: op.occurredAt,
                clientId,
            });
            written++;
        }

        return {
            clientId: op.clientId,
            status: written === 0 ? 'duplicate' : 'applied',
        };
    },
    'member-create': async (ctx, op) => {
        const { pb, bar } = ctx
        if (await findMemberByNickName(pb, bar, op.nickName)) {
            return { clientId: op.clientId, status: 'duplicate' };
        }

        await pb.collection<BarMember>('bar_members').create({
            bar: bar.id,
            nickName: op.nickName,
            seq: await claimMemberSeq(pb, bar, op.memberSeq),
        });

        return { clientId: op.clientId, status: 'applied' };
    },
    'tag-mapping': async (ctx, op) => {
        const { pb, bar } = ctx
        // A `local:` id points at a member enrolled on the tablet, whose `member-create` op
        // ran earlier in this batch — the nickname is what links the two.
        let memberId = serverMemberId(op.memberId);

        if (!memberId) {
            const existing = await findMemberByNickName(pb, bar, op.nickName);

            if (existing) {
                memberId = existing.id;
            } else {
                const created = await pb.collection<BarMember>('bar_members').create({
                    bar: bar.id,
                    nickName: op.nickName,
                    seq: await claimMemberSeq(pb, bar, 0),
                });
                memberId = created.id;
            }
        }

        const existingMapping = await pb.collection('bar_member_mappings').getFirstListItem(
            pb.filter('member.bar = {:bar} && serialId = {:serialId}', {
                bar: bar.id,
                serialId: op.serialId,
            }),
        ).catch(() => null);

        if (existingMapping) {
            if (existingMapping.member === memberId) {
                return { clientId: op.clientId, status: 'duplicate' };
            }
            await pb.collection('bar_member_mappings').update(existingMapping.id, {
                member: memberId,
                serialId: op.serialId,
            });
            return { clientId: op.clientId, status: 'applied' };
        }

        await pb.collection('bar_member_mappings').create({
            serialId: op.serialId,
            member: memberId,
        });

        return { clientId: op.clientId, status: 'applied' };
    },
    'settlement': async ({ pb, bar }, op) => {
        if (await eventExists(pb, op.clientId)) {
            return { clientId: op.clientId, status: 'duplicate' };
        }

        await pb.collection('events').create({
            type: 'member-settled',
            target: `bar:${bar.slug}`,
            occurredAt: op.occurredAt,
            clientId: op.clientId,
            data: {
                member: op.memberId,
                amountDue: op.amountDue,
                amountPaid: op.amountPaid,
            },
        });

        return { clientId: op.clientId, status: 'applied' };
    },
    'unseal': async (ctx, op) => {
        if (await eventExists(ctx.pb, op.clientId)) {
            return { clientId: op.clientId, status: 'duplicate' };
        }

        await barDoUnseal(ctx, ctx.bar.slug, op)

        return { clientId: op.clientId, status: 'applied' };
    },
    'device-config': async ({ pb, bar, device }, op) => {
        if (await eventExists(pb, op.clientId)) {
            return { clientId: op.clientId, status: 'duplicate' };
        }

        const config = readPosConfig(op.config);

        await pb.collection('pos_devices').update(device.id, {
            config,
        });

        await pb.collection('events').create({
            type: 'device-config',
            target: `bar:${bar.slug}`,
            occurredAt: op.occurredAt,
            clientId: op.clientId,
            data: { device: device.id, config },
        });

        return { clientId: op.clientId, status: 'applied' };
    }
}

async function resolveOrderCustomer(
    { pb, bar }: { pb: Db; bar: Bar },
    op: OrderOp,
): Promise<string> {
    const known = serverMemberId(op.memberId);
    if (known) return known;

    if (op.serialId) {
        const mapping = await pb.collection('bar_member_mappings').getFirstListItem(
            pb.filter('member.bar = {:bar} && serialId = {:serialId}', {
                bar: bar.id,
                serialId: op.serialId,
            }),
        ).catch(() => null);

        if (mapping) return String(mapping.member);
        throw new Error(`no member mapped to card ${op.serialId}`);
    }

    const member = await findMemberByNickName(pb, bar, op.memberLabel);
    if (member) return member.id;

    throw new Error(`no member named ${op.memberLabel}`);
}

function findMemberByNickName(pb: Db, bar: Bar, nickName: string) {
    return pb.collection<BarMember>('bar_members').getFirstListItem(
        pb.filter('bar = {:bar} && nickName = {:nickName}', { bar: bar.id, nickName }),
    ).catch(() => null);
}

async function claimMemberSeq(pb: Db, bar: Pick<Ctx["bar"], "id">, wanted: number): Promise<number> {
    const members = await pb.collection<BarMember>('bar_members').getFullList({
        filter: pb.filter('bar = {:bar}', { bar: bar.id }),
        sort: '-seq',
    });

    if (wanted > 0 && !members.some(member => member.seq === wanted)) return wanted;

    return members.length > 0 ? members[0].seq + 1 : 1;
}

async function eventExists(pb: Db, clientId: string): Promise<boolean> {
    const found = await pb.collection('events').getFirstListItem(
        pb.filter('clientId = {:clientId}', { clientId }),
    ).catch(() => null);

    return !!found;
}
