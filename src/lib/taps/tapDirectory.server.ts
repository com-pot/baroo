import { env } from '$env/dynamic/private';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { BarOfferItem, OfferPackage } from '$lib/bar/BarModel';
import { offeredServings, servingPreset, type ServingPreset } from '$lib/bar/servings';
import { normalizeTag, type TagMapping } from '$lib/bar/tags';
import type { Measure } from '$lib/si/measure';

/** A PocketBase file, the filename changes on every upload */
export type StoredImage = { collection: string; recordId: string; filename: string };

export type Drink = {
    key: string;
    name: string;
    image: StoredImage | null;
    servingPreset: ServingPreset["key"];
    measure: Measure;
    /** Serving keys the item is offered in */
    servings: string[];
};

export type Package = Pick<OfferPackage, 'id' | 'offerItemKey' | 'label' | 'quantity'>;

export type Cardholder = { memberId: string; nickName: string; image: StoredImage | null };

type BarDirectory = {
    /** Offer item key → drink */
    drinks: Record<string, Drink>;
    /** Package tag serial → package kind */
    packages: Record<string, Package>;
    /** Member card serial → cardholder */
    cards: Record<string, Cardholder>;
};

type DirectoryFile = { version: 3; bars: Record<string, BarDirectory> };

const DEFAULT_DIR = 'data/_taps';

export function tapCacheDir(): string {
    return resolve(env.TAP_CACHE_DIR?.trim() || DEFAULT_DIR);
}

/**
 * What the TapTappers need to know about a bar, learned from the latest snapshot pull
 *
 * Persisted to disk so the venue server knows it after a restart without PocketBase.
 */
let directory: Promise<DirectoryFile> | null = null;
let writes: Promise<void> = Promise.resolve();
let version = 0;

function directoryPath(): string {
    return join(tapCacheDir(), 'directory.json');
}

function load(ctx: Pick<App.Locals, "logger">): Promise<DirectoryFile> {
    return (directory ??= readFile(directoryPath(), 'utf8')
        .then((text): DirectoryFile => {
            const parsed = JSON.parse(text);
            return parsed?.version === 3 ? parsed : { version: 3, bars: {} };
        })
        .catch((err: NodeJS.ErrnoException): DirectoryFile => {
            if (err.code !== 'ENOENT') ctx.logger.warn(err, '[taps] directory unreadable, starting empty');
            return { version: 3, bars: {} };
        }));
}

async function bar(ctx: Pick<App.Locals, "logger">, barSlug: string): Promise<BarDirectory | undefined> {
    return (await load(ctx)).bars[barSlug];
}

/** Changes with every directory change */
export function directoryVersion(): number {
    return version;
}

export async function lookupPackageTag(ctx: Pick<App.Locals, "logger">, barSlug: string, serialId: string): Promise<Package | null> {
    return (await bar(ctx, barSlug))?.packages[serialId] ?? null;
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
        offerItems: Pick<BarOfferItem, 'id' | 'key' | 'name' | 'preview_1x1' | 'servingPreset' | 'pricing'>[];
        packages?: OfferPackage[];
        mappings: TagMapping[];
    },
): Promise<boolean> {
    try {
        const fresh: BarDirectory = { drinks: {}, packages: {}, cards: {} };

        for (const item of snapshot.offerItems) {
            fresh.drinks[item.key] = {
                key: item.key,
                name: item.name,
                image: item.preview_1x1
                    ? { collection: 'bar_offer_items', recordId: item.id, filename: item.preview_1x1 }
                    : null,
                servingPreset: item.servingPreset,
                measure: servingPreset(item.servingPreset).measure,
                servings: offeredServings(item).map((serving) => serving.key),
            };
        }

        for (const offerPackage of snapshot.packages ?? []) {
            const serial = normalizeTag(offerPackage.tagSerial ?? '');
            if (!serial || !fresh.drinks[offerPackage.offerItemKey]) continue;

            fresh.packages[serial] = {
                id: offerPackage.id,
                offerItemKey: offerPackage.offerItemKey,
                label: offerPackage.label,
                quantity: offerPackage.quantity,
            };
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
        ctx.logger.error(err, '[taps] could not store the directory');
        return false;
    }
}

async function persist(all: DirectoryFile): Promise<void> {
    const path = directoryPath();
    const temporary = `${path}.tmp`;

    await mkdir(tapCacheDir(), { recursive: true });
    await writeFile(temporary, JSON.stringify(all, null, 2));
    await rename(temporary, path);
}
