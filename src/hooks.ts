import { deLocalizeUrl } from '$lib/paraglide/runtime';
import type { Reroute } from '@sveltejs/kit';

/**
 * Hosts that serve nothing but the standalone lizard counter.
 *
 * A literal, because this hook is universal — it is bundled into the client, so it cannot
 * read private env.
 */
const COUNTER_HOSTS = new Set(['lizard.kous.at']);

/**
 * De-localizing has to come first, so `/en` reaches the counter too.
 *
 * `reroute` is the only rewrite that runs on both the server and the client, which is why
 * the counter host is resolved here rather than in Caddy: a proxy-side path rewrite would
 * leave the browser resolving `/` against the page the server rendered for `/gzt`. Keep the
 * body cheap and incapable of throwing — a failure here is a bare 500 for every request.
 */
export const reroute: Reroute = ({ url }) => {
    const pathname = deLocalizeUrl(url).pathname;

    // Only the root is claimed; everything else falls through, so /api/counters/* and
    // /_app/* keep working and /gzt stays reachable on the main host for testing.
    if (pathname === '/' && COUNTER_HOSTS.has(url.hostname)) return '/gzt';

    return pathname;
};
