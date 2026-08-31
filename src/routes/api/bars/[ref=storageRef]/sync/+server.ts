import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { Db } from '$lib/db.server';
import { resolveDevice, type PosDevice } from '$lib/pos/device.server';
import { collectClosureData, type UnsealEvent } from '$lib/bar/stats/barOfferItems';
import type { Bar, BarMember } from '$lib/bar/BarModel';
import {
    serverMemberId,
    type MemberCreateOp,
    type OrderOp,
    type OutboxOp,
    type SettlementOp,
    type TagMappingOp,
    type UnsealOp,
} from '$lib/offline/op';
import { type SyncOpResult } from '$lib/offline/sync';

/**
 * Drains a tablet's outbox.
 *
 * Two properties matter more than anything else here:
 *
 *  - **Order.** Ops are applied in the order the tablet queued them, because an `order`
 *    op refers to its drinker by NFC serial and a `tag-mapping` op earlier in the same
 *    batch may be what introduces that serial.
 *  - **Idempotency.** Every write carries the op's `clientId`, and every handler looks
 *    for its own prior output before writing. A barman who taps Sync twice — or a
 *    tablet that retries after a dropped connection — must not double anyone's tab.
 *
 * One op failing is reported against that op and nothing else; the rest of the batch
 * still goes through. A failed op stays in the tablet's outbox.
 */
export const POST: RequestHandler = async (event) => {
    const barSlug = event.params.ref;
    const { device, pb, token } = await resolveDevice(event, barSlug);

    const body = await event.request.json().catch(() => null);
    const ops: OutboxOp[] = body?.ops;

    if (!Array.isArray(ops)) {
        error(400, 'expected { ops: [...] }');
    }

    const bar = await pb.collection<Bar>('bars').getFirstListItem(
        pb.filter('slug = {:slug}', { slug: barSlug }),
    );

    const results: SyncOpResult[] = [];

    for (const op of ops) {
        if (op.barSlug !== barSlug) {
            results.push({ clientId: op.clientId, status: 'failed', error: 'bar-mismatch' });
            continue;
        }

        // A guest kiosk drains its own orders, but only a staff device may settle tabs,
        // unseal packages or hand out cards.
        if (op.kind !== 'order' && device.kind !== 'staff') {
            results.push({ clientId: op.clientId, status: 'failed', error: 'staff-device-required' });
            continue;
        }

        try {
            results.push(await applyOp({ pb, bar, device, op }));
        } catch (err) {
            console.error(`[sync] op ${op.clientId} (${op.kind}) failed:`, err);
            results.push({
                clientId: op.clientId,
                status: 'failed',
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    return json({ results, token });
};

type Ctx = { pb: Db; bar: Bar; device: PosDevice; op: OutboxOp };

function applyOp(ctx: Ctx): Promise<SyncOpResult> {
    switch (ctx.op.kind) {
        case 'order':
            return applyOrder({ ...ctx, op: ctx.op });
        case 'tag-mapping':
            return applyTagMapping({ ...ctx, op: ctx.op });
        case 'settlement':
            return applySettlement({ ...ctx, op: ctx.op });
        case 'member-create':
            return applyMemberCreate({ ...ctx, op: ctx.op });
        case 'unseal':
            return applyUnseal({ ...ctx, op: ctx.op });
        default:
            throw new Error(`unknown op kind: ${(ctx.op as OutboxOp).kind}`);
    }
}

/** Each drink becomes its own row, tagged `<clientId>#<index>`. */
async function applyOrder({ pb, bar, op }: Ctx & { op: OrderOp }): Promise<SyncOpResult> {
    const customer = await resolveOrderCustomer({ pb, bar, op });

    // Rows this op already wrote, from an earlier attempt.
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
}

/**
 * Who the round is for.
 *
 * A card order names its drinker by NFC serial; one keyed in by badge number names them
 * by member id. That id may be a `local:` placeholder for someone enrolled on the tablet
 * earlier in this same batch — in which case the nickname is the only handle we have,
 * and the `member-create` op ahead of us has already made the record.
 */
async function resolveOrderCustomer(
    { pb, bar, op }: { pb: Db; bar: Bar; op: OrderOp },
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

/**
 * Enrols a member handed a badge on the tablet.
 *
 * The barman picks the number, so two tablets offline at once can pick the same one.
 * Rather than reject the op — which would strand a real person's tab in an outbox — a
 * taken number is bumped to the next free one, and the badge gets reprinted.
 */
async function applyMemberCreate({ pb, bar, op }: Ctx & { op: MemberCreateOp }): Promise<SyncOpResult> {
    if (await findMemberByNickName(pb, bar, op.nickName)) {
        return { clientId: op.clientId, status: 'duplicate' };
    }

    await pb.collection<BarMember>('bar_members').create({
        bar: bar.id,
        nickName: op.nickName,
        seq: await claimMemberSeq(pb, bar, op.memberSeq),
    });

    return { clientId: op.clientId, status: 'applied' };
}

function findMemberByNickName(pb: Db, bar: Bar, nickName: string) {
    return pb.collection<BarMember>('bar_members').getFirstListItem(
        pb.filter('bar = {:bar} && nickName = {:nickName}', { bar: bar.id, nickName }),
    ).catch(() => null);
}

/** `wanted` if nobody holds it, otherwise one past the highest number in the bar. */
async function claimMemberSeq(pb: Db, bar: Bar, wanted: number): Promise<number> {
    const members = await pb.collection<BarMember>('bar_members').getFullList({
        filter: pb.filter('bar = {:bar}', { bar: bar.id }),
        sort: '-seq',
    });

    if (wanted > 0 && !members.some(member => member.seq === wanted)) return wanted;

    return members.length > 0 ? members[0].seq + 1 : 1;
}

/**
 * Upserts the card→member link. Idempotent by nature: the same card mapped to the same
 * member twice is one row either way.
 */
async function applyTagMapping({ pb, bar, op }: Ctx & { op: TagMappingOp }): Promise<SyncOpResult> {
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
}

async function applySettlement({ pb, bar, op }: Ctx & { op: SettlementOp }): Promise<SyncOpResult> {
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
}

/**
 * The closure snapshot — how much came out of the package being replaced — is computed
 * here at sync time, not on the tablet: it needs the full order history, which the
 * tablet only has a slice of.
 */
async function applyUnseal({ pb, bar, op }: Ctx & { op: UnsealOp }): Promise<SyncOpResult> {
    if (await eventExists(pb, op.clientId)) {
        return { clientId: op.clientId, status: 'duplicate' };
    }

    const closureData = await collectClosureData(pb, { slug: bar.slug }, op.offerItemKey);

    // `satisfies` so a rename in the event payload can't quietly diverge from the op —
    // `create()` takes an untyped record, and this is the only writer of `unseal`.
    await pb.collection('events').create({
        type: 'unseal',
        target: `bar:${bar.slug}`,
        occurredAt: op.occurredAt,
        clientId: op.clientId,
        data: {
            offerItemKey: op.offerItemKey,
            quantity: op.quantity,
            closureData,
        },
    } satisfies Pick<UnsealEvent, 'type' | 'target' | 'data'> & { occurredAt: string; clientId: string });

    return { clientId: op.clientId, status: 'applied' };
}

async function eventExists(pb: Db, clientId: string): Promise<boolean> {
    const found = await pb.collection('events').getFirstListItem(
        pb.filter('clientId = {:clientId}', { clientId }),
    ).catch(() => null);

    return !!found;
}
