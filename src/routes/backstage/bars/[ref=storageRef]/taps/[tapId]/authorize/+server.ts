import { error } from '@sveltejs/kit';
import { ClientResponseError } from 'pocketbase';
import type { RequestHandler } from './$types';
import { ensureUser } from '$lib/acl.server';
import type { Bar } from '$lib/bar/BarModel';
import { BarTapsCollection, type BarTap } from '$lib/taps/barTap';
import { parseTapConfig, readBarWifiNetworks } from '$lib/taps/tapAdmin.server';
import { materializeTapConfig } from '$lib/taps/tapConfig.server';

/**
 * Authorizes a tap with the config posted, replying with its config file - the only place
 * its token ever shows. Revokes the token the tap had before.
 */
export const POST: RequestHandler = async ({ request, params, locals }) => {
    ensureUser(locals, ['bar-manager']);

    const bar = await locals.pb.collection<Bar>('bars')
        .getFirstListItem(locals.pb.filter('slug = {:slug}', { slug: params.ref }));
    const tap = await locals.pb.collection<BarTap>(BarTapsCollection).getOne(params.tapId)
        .catch(() => error(404, 'tap-unknown'));
    if (tap.bar !== bar.id) error(404, 'tap-unknown');

    const config = parseTapConfig(tap, await request.json().then((body) => body?.config, () => null));
    if (!config) error(400, 'invalid-config');

    const wifiNetworks = await readBarWifiNetworks(locals.pb, bar.slug);
    const unsigned = materializeTapConfig({ ...tap, config }, bar, wifiNetworks, null);
    if (!unsigned) error(400, 'unknown-model');

    const { token, validThrough } = await locals.pb.send<{ token: string; validThrough: string }>(
        `/api/baroo/taps/${encodeURIComponent(tap.id)}/authorize`,
        { method: 'POST', body: { config, configChecksum: unsigned.checksum } },
    ).catch((err: unknown) => {
        locals.logger.error(err, '[taps] could not authorize a tap');
        error(err instanceof ClientResponseError && err.status ? err.status : 503, 'tap-not-authorized');
    });

    const { file } = materializeTapConfig({ ...tap, config }, bar, wifiNetworks, { token, validThrough })!;

    return new Response(file, {
        headers: {
            'content-type': 'text/x-python; charset=utf-8',
            'content-disposition': 'attachment; filename="config.py"',
            'cache-control': 'no-store',
        },
    });
};
