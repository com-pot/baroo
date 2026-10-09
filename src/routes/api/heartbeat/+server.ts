import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** A PocketBase that has stopped answering is a server the kiosk cannot sync against. */
const PB_TIMEOUT_MS = 3_000;

const NO_STORE = { 'cache-control': 'no-store' };

/**
 * "Is the venue's server reachable, and can it still reach its data?"
 *
 * This is what the kiosk's online/offline badge means. A tablet on wifi with no route
 * to the server — a captive portal, a router that came up without its uplink, an app
 * container that is restarting — is offline for every purpose the kiosk has, and the
 * only way to learn that is to ask the server itself.
 *
 * PocketBase is part of the answer on purpose: `sync` and `snapshot` both go through it,
 * so an app server that cannot see its database would only accept ops to fail them. The
 * kiosk is better off buffering. The check is a health ping, not a query, and no
 * heartbeat ever touches a collection.
 *
 * Deliberately unauthenticated — a tablet whose device token has lapsed still needs to
 * know whether it is worth trying to renew it.
 */
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
