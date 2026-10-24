import { env } from '$env/dynamic/private';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { BarOfferItem } from '$lib/bar/BarModel';
import { normalizeTag } from '$lib/bar/tags';

export type BeverageTag = { key: string; name: string };

/** Bar slug → tag serial → beverage */
type TagFile = Record<string, Record<string, BeverageTag>>;

const DEFAULT_FILE = 'data/_spigots.json';

/**
 * Beverage tags as learned from the latest snapshot pull
 *
 * Persisted to disk so the venue server knows them after a restart without PocketBase.
 */
let tags: Promise<TagFile> | null = null;
let writes: Promise<void> = Promise.resolve();

function tagFilePath(): string {
    return resolve(env.SPIGOT_CACHE_FILE?.trim() || DEFAULT_FILE);
}

function load(ctx: Pick<App.Locals, "logger">): Promise<TagFile> {
    return (tags ??= readFile(tagFilePath(), 'utf8')
        .then((text): TagFile => JSON.parse(text))
        .catch((err: NodeJS.ErrnoException): TagFile => {
            if (err.code !== 'ENOENT') ctx.logger.warn(err, '[spigots] beverage tags unreadable, starting empty');
            return {};
        }));
}

export async function lookupBeverageTag(ctx: Pick<App.Locals, "logger">, barSlug: string, serialId: string): Promise<BeverageTag | null> {
    return (await load(ctx))[barSlug]?.[serialId] ?? null;
}

/** Never throws */
export async function rememberOfferItems(
    ctx: Pick<App.Locals, "logger">,
    barSlug: string,
    offerItems: Pick<BarOfferItem, 'key' | 'name' | 'tagSerial'>[],
): Promise<void> {
    try {
        const fresh: Record<string, BeverageTag> = {};
        for (const item of offerItems) {
            const serial = normalizeTag(item.tagSerial ?? '');
            if (serial) fresh[serial] = { key: item.key, name: item.name };
        }

        const all = await load(ctx);
        if (JSON.stringify(all[barSlug] ?? {}) === JSON.stringify(fresh)) return;

        all[barSlug] = fresh;

        // Serialized so an older offer can't overwrite a newer one
        const write = writes.then(() => persist(all));
        writes = write.catch(() => {});
        await write;
    } catch (err) {
        ctx.logger.error(err, '[spigots] could not store beverage tags');
    }
}

async function persist(all: TagFile): Promise<void> {
    const path = tagFilePath();
    const temporary = `${path}.tmp`;

    await mkdir(dirname(path), { recursive: true });
    await writeFile(temporary, JSON.stringify(all, null, 2));
    await rename(temporary, path);
}
