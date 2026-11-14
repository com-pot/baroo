import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { resolveDevice } from '$lib/pos/device.server';

import type { Bar } from '$lib/bar/BarModel';
import { type OutboxOp } from '$lib/offline/op';
import { type SyncOpResult, type SyncResponse } from '$lib/offline/sync';
import { applyOp } from './barOpHandler';
import { broadcastTaps } from '$lib/taps/tapBoard.server';
import z from 'zod';

const syncBodySchema = z.object({
    ops: z.array(z.looseObject({})).min(1),
})

const TAP_OP_KINDS = new Set<OutboxOp["kind"]>(['order', 'unseal', 'flush']);

export const POST: RequestHandler = async ({ params, request, locals}) => {
    const barSlug = params.ref;
    const { device, pb, token } = await resolveDevice(request, barSlug);

    const body = syncBodySchema.safeParse(await request.json().catch(() => null)) ;
    if (!body.success) {
        error(400, {
            message: "invalid-data",
            details: { issues: body.error.issues },
        });
    }

    const bar = await pb.collection<Bar>('bars').getFirstListItem(
        pb.filter('slug = {:slug}', { slug: barSlug }),
    );

    const results: SyncOpResult[] = [];
    for (const op of body.data.ops as unknown as OutboxOp[]) {
        if (op.barSlug !== barSlug) {
            results.push({ clientId: op.clientId, status: 'failed', error: 'bar-mismatch' });
            continue;
        }

        if (op.kind !== 'order' && device.kind !== "staff") {
            results.push({ clientId: op.clientId, status: 'failed', error: 'staff-device-required' });
            continue;
        }

        try {
            results.push(await applyOp({ pb, bar }, op));
        } catch (err) {
            locals.logger.error(err, `[sync] op ${op.clientId} (${op.kind}) failed:`);
            results.push({
                clientId: op.clientId,
                status: 'failed',
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    // Orders drain the packages on taps, unseals and flushes change what is on them
    const tapsChanged = body.data.ops.some((op, i) => results[i].status === 'applied' && TAP_OP_KINDS.has((op as unknown as OutboxOp).kind));
    if (tapsChanged) {
        await broadcastTaps(locals, pb, barSlug).catch((err) => locals.logger.error(err, '[taps] could not tell what is on the taps'));
    }

    const response: SyncResponse = {
        token,
        results: {
            applied: results.filter((result) => result.status === "applied"),
            duplicate: results.filter((result) => result.status === "duplicate"),
            failed: results.filter((result) => result.status === "failed"),
        }
    }

    return json(response);
};
