import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { resolveDevice } from '$lib/pos/device.server';

import type { Bar } from '$lib/bar/BarModel';
import {
    type OutboxOp,
} from '$lib/offline/op';
import { type SyncOpResult } from '$lib/offline/sync';
import { applyOp } from './barOpHandler';

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

        if (op.kind !== 'order' && device.kind !== "staff") {
            results.push({ clientId: op.clientId, status: 'failed', error: 'staff-device-required' });
            continue;
        }

        try {
            results.push(await applyOp({ pb, bar, device }, op));
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
