import { createHash } from 'node:crypto';
import type { Bar } from '$lib/bar/BarModel';
import type { WifiNetwork } from '$lib/settings/wifiNetworks';
import { readTapConfig, tapModel } from './models';
import type { BarTap } from './barTap';

type Materialized = { file: string; checksum: string };

/**
 * The config file a tap gets, and the checksum of it without the token - which tells
 * whether what the tap runs is still what backstage has
 *
 * `null` for a tap of an unknown model.
 */
export function materializeTapConfig(
    tap: Pick<BarTap, 'sequence' | 'name' | 'model' | 'config'>,
    bar: Pick<Bar, 'slug'>,
    wifiNetworks: WifiNetwork[],
    auth: { token: string; validThrough: string } | null,
): Materialized | null {
    const model = tapModel(tap.model);
    if (!model) return null;

    const config = readTapConfig(model, tap.config);
    const wifiId = (config as { wifiNetwork?: string }).wifiNetwork;
    const ctx = {
        // Not localized, the checksum must not depend on who looks
        label: `tap ${tap.sequence}${tap.name.trim() ? ` (${tap.name.trim().replaceAll(/\s+/g, ' ')})` : ''}`,
        barSlug: bar.slug,
        wifi: wifiNetworks.find((network) => network.id === wifiId) ?? null,
    };

    const unsigned = model.materialize(config, { ...ctx, token: '', validThrough: '' });

    return {
        file: auth ? model.materialize(config, { ...ctx, ...auth }) : unsigned,
        checksum: createHash('sha256').update(unsigned).digest('hex'),
    };
}
