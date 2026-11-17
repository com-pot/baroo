import type { Db } from '$lib/db.server';
import type { Bar } from '$lib/bar/BarModel';

export const AppSettingsCollection = 'app_settings';

export type AppSetting = {
    id: string;
    namespace: string;
    key: string;
    value: unknown;
};

export function barNamespace(barSlug: Bar["slug"]): string {
    return `bar:${barSlug}`;
}

/** `null` when never set */
export async function readSetting(pb: Db, namespace: string, key: string): Promise<unknown> {
    const [setting] = await pb.collection<AppSetting>(AppSettingsCollection).getFullList({
        filter: pb.filter('namespace = {:namespace} && key = {:key}', { namespace, key }),
    });

    return setting?.value ?? null;
}

export async function writeSetting(pb: Db, namespace: string, key: string, value: unknown): Promise<void> {
    const [existing] = await pb.collection<AppSetting>(AppSettingsCollection).getFullList({
        filter: pb.filter('namespace = {:namespace} && key = {:key}', { namespace, key }),
    });

    if (existing) {
        await pb.collection(AppSettingsCollection).update(existing.id, { value });
    } else {
        await pb.collection(AppSettingsCollection).create({ namespace, key, value });
    }
}
