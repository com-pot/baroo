import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const PB_TIMEOUT_MS = 3_000;

const NO_STORE = { 'cache-control': 'no-store' };

export const GET: RequestHandler = async ({ locals }) => {
    const at = new Date().toISOString();

    const pbReachable = await locals.pb.health
        .check({ signal: AbortSignal.timeout(PB_TIMEOUT_MS) })
        .then(() => true)
        .catch(() => false);

    if (!pbReachable) {
        return json({ ok: false, reason: 'pb-unreachable', at }, { status: 503, headers: NO_STORE });
    }

    return json({ ok: true, at }, { headers: NO_STORE });
};
