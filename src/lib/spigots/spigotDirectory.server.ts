import { env } from '$env/dynamic/private';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { BarOfferItem } from '$lib/bar/BarModel';
import { normalizeTag, type TagMapping } from '$lib/bar/tags';

/** A PocketBase file, the filename changes on every upload */
export type StoredImage = { collection: string; recordId: string; filename: string };

export type Drink = { key: string; name: string; image: StoredImage | null };

export type Cardholder = { memberId: string; nickName: string; image: StoredImage | null };

type BarDirectory = {
    /** Offer item key → drink */
    drinks: Record<string, Drink>;
    /** Beverage tag serial → offer item key */
    beverageTags: Record<string, string>;
    /** Member card serial → cardholder */
    cards: Record<string, Cardholder>;
};

type DirectoryFile = { version: 2; bars: Record<string, BarDirectory> };

const DEFAULT_DIR = 'data/_spigots';

export function spigotCacheDir(): string {
    return resolve(env.SPIGOT_CACHE_DIR?.trim() || DEFAULT_DIR);
}

/**
 * What the spigot stations need to know about a bar, learned from the latest snapshot pull
 *
 * Persisted to disk so the venue server knows it after a restart without PocketBase.
 */
let directory: Promise<DirectoryFile> | null = null;
let writes: Promise<void> = Promise.resolve();
let version = 0;

function directoryPath(): string {
    return join(spigotCacheDir(), 'directory.json');
}

function load(ctx: Pick<App.Locals, "logger">): Promise<DirectoryFile> {
    return (directory ??= readFile(directoryPath(), 'utf8')
        .then((text): DirectoryFile => {
            const parsed = JSON.parse(text);
            return parsed?.version === 2 ? parsed : { version: 2, bars: {} };
        })
        .catch((err: NodeJS.ErrnoException): DirectoryFile => {
            if (err.code !== 'ENOENT') ctx.logger.warn(err, '[spigots] directory unreadable, starting empty');
            return { version: 2, bars: {} };
        }));
}

async function bar(ctx: Pick<App.Locals, "logger">, barSlug: string): Promise<BarDirectory | undefined> {
    return (await load(ctx)).bars[barSlug];
}

/** Changes with every directory change */
export function directoryVersion(): number {
    return version;
}

export async function lookupBeverageTag(ctx: Pick<App.Locals, "logger">, barSlug: string, serialId: string): Promise<Drink | null> {
    const known = await bar(ctx, barSlug);
    const key = known?.beverageTags[serialId];
    return known && key ? known.drinks[key] ?? null : null;
}

export async function lookupDrink(ctx: Pick<App.Locals, "logger">, barSlug: string, key: string): Promise<Drink | null> {
    return (await bar(ctx, barSlug))?.drinks[key] ?? null;
}

export async function lookupCard(ctx: Pick<App.Locals, "logger">, barSlug: string, serialId: string): Promise<Cardholder | null> {
    return (await bar(ctx, barSlug))?.cards[serialId] ?? null;
}

export async function directoryImages(ctx: Pick<App.Locals, "logger">, barSlug: string): Promise<StoredImage[]> {
    const known = await bar(ctx, barSlug);
    if (!known) return [];

    return [...Object.values(known.drinks), ...Object.values(known.cards)]
        .map(entry => entry.image)
        .filter((image): image is StoredImage => !!image);
}

/** Never throws, returns whether anything changed */
export async function rememberSnapshot(
    ctx: Pick<App.Locals, "logger">,
    barSlug: string,
    snapshot: {
        offerItems: Pick<BarOfferItem, 'id' | 'key' | 'name' | 'tagSerial' | 'preview_1x1'>[];
        mappings: TagMapping[];
    },
): Promise<boolean> {
    try {
        const fresh: BarDirectory = { drinks: {}, beverageTags: {}, cards: {} };

        for (const item of snapshot.offerItems) {
            fresh.drinks[item.key] = {
                key: item.key,
                name: item.name,
                image: item.preview_1x1
                    ? { collection: 'bar_offer_items', recordId: item.id, filename: item.preview_1x1 }
                    : null,
            };

            const serial = normalizeTag(item.tagSerial ?? '');
            if (serial) fresh.beverageTags[serial] = item.key;
        }

        for (const mapping of snapshot.mappings) {
            const serial = normalizeTag(mapping.serialId);
            if (!serial || !mapping.member.id) continue;

            const avatar = typeof mapping.extra?.avatar_1x1 === 'string' ? mapping.extra.avatar_1x1 : '';
            fresh.cards[serial] = {
                memberId: mapping.member.id,
                nickName: mapping.member.nickName,
                image: avatar ? { collection: 'bar_members', recordId: mapping.member.id, filename: avatar } : null,
            };
        }

        const all = await load(ctx);
        if (JSON.stringify(all.bars[barSlug] ?? null) === JSON.stringify(fresh)) return false;

        all.bars[barSlug] = fresh;
        version++;

        // Serialized so an older snapshot can't overwrite a newer one
        const write = writes.then(() => persist(all));
        writes = write.catch(() => {});
        await write;
        return true;
    } catch (err) {
        ctx.logger.error(err, '[spigots] could not store the directory');
        return false;
    }
}

async function persist(all: DirectoryFile): Promise<void> {
    const path = directoryPath();
    const temporary = `${path}.tmp`;

    await mkdir(spigotCacheDir(), { recursive: true });
    await writeFile(temporary, JSON.stringify(all, null, 2));
    await rename(temporary, path);
}
