import { randomBytes } from 'node:crypto';
import type { Db } from '$lib/db.server';
import type { Bar } from '$lib/bar/BarModel';
import { toIsoDate } from '$lib/pocketbase';
import { barNamespace, readSetting, writeSetting } from '$lib/settings/appSettings.server';
import { readWifiNetworks, WIFI_NETWORKS_KEY, type WifiNetwork } from '$lib/settings/wifiNetworks';
import { DEFAULT_TAP_MODEL, readTapConfig, tapModel } from './models';
import { materializeTapConfig } from './tapConfig.server';
import { BarTapsCollection, type BarTap } from './barTap';

/** Whether the config file the tap runs is what backstage has */
export type TapAuthorization = 'unauthorized' | 'expired' | 'changed' | 'authorized';

export async function readBarWifiNetworks(pb: Db, barSlug: Bar["slug"]): Promise<WifiNetwork[]> {
    return readWifiNetworks(await readSetting(pb, barNamespace(barSlug), WIFI_NETWORKS_KEY));
}

export async function writeBarWifiNetworks(pb: Db, barSlug: Bar["slug"], networks: WifiNetwork[]): Promise<void> {
    await writeSetting(pb, barNamespace(barSlug), WIFI_NETWORKS_KEY, networks);
}

export function tapAuthorization(tap: BarTap, bar: Pick<Bar, 'slug'>, wifiNetworks: WifiNetwork[]): TapAuthorization {
    if (!tap.validThrough) return 'unauthorized';
    if (Date.parse(toIsoDate(tap.validThrough)) <= Date.now()) return 'expired';

    const materialized = materializeTapConfig(tap, bar, wifiNetworks, null);
    return materialized?.checksum === tap.configChecksum ? 'authorized' : 'changed';
}

/** A new tap, next in line, with the model's defaults and the bar's first wifi */
export async function createTap(
    pb: Db,
    bar: Pick<Bar, 'id' | 'slug'>,
    input: { name: string; posDevice: string | null },
): Promise<BarTap> {
    const model = tapModel(DEFAULT_TAP_MODEL)!;
    const [last] = await pb.collection<BarTap>(BarTapsCollection).getList(1, 1, {
        filter: pb.filter('bar = {:bar}', { bar: bar.id }),
        sort: '-sequence',
        fields: 'sequence',
    }).then((page) => page.items);

    const [wifi] = await readBarWifiNetworks(pb, bar.slug);
    // An auth record needs a password, the tap never uses it - its token comes on authorizing
    const password = randomBytes(24).toString('base64url');

    return pb.collection<BarTap>(BarTapsCollection).create({
        bar: bar.id,
        sequence: (last?.sequence ?? 0) + 1,
        name: input.name,
        posDevice: input.posDevice ?? '',
        model: model.key,
        config: { ...model.configSchema.parse({}), wifiNetwork: wifi?.id ?? '' },
        password,
        passwordConfirm: password,
    });
}

/** The config as the tap's model reads it, `null` for a config that doesn't */
export function parseTapConfig(tap: Pick<BarTap, 'model'>, raw: unknown): object | null {
    const model = tapModel(tap.model);
    if (!model) return null;

    const parsed = model.configSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
}

export function readStoredTapConfig(tap: Pick<BarTap, 'model' | 'config'>): object | null {
    const model = tapModel(tap.model);
    return model ? readTapConfig(model, tap.config) : null;
}
