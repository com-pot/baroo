import { env } from '$env/dynamic/private';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { BarOfferItem } from '$lib/bar/BarModel';
import { normalizeTag, type TagMapping } from '$lib/bar/tags';

/** A file stored in PocketBase: enough to fetch it, and to notice when it was replaced. */
export type StoredImage = { collection: string; recordId: string; filename: string };

export type Drink = { key: string; name: string; image: StoredImage | null };

export type Cardholder = { memberId: string; nickName: string; image: StoredImage | null };

/** What the spigot stations of one bar need to know without asking PocketBase. */
type BarDirectory = {
    /** Offer item key → the drink. */
    drinks: Record<string, Drink>;
    /** Beverage tag serial → offer item key. */
    beverageTags: Record<string, string>;
    /** Member card serial → who holds it. */
    cards: Record<string, Cardholder>;
};

type DirectoryFile = { version: 2; bars: Record<string, BarDirectory> };

const DEFAULT_DIR = 'data/_spigots';

/** Where the venue server keeps what it learned for the stations — this and the pictures. */
export function spigotCacheDir(): string {
    return resolve(env.SPIGOT_CACHE_DIR?.trim() || DEFAULT_DIR);
}

/**
 * The bar as the spigot stations see it: which tags are drinks, what the drinks are
 * called, whose cards are whose.
 *
 * A station asks on every scan, so none of it can wait on PocketBase. The server learns
 * it as a side effect of every kiosk snapshot pull — that request has the offer and the
 * card mappings in hand anyway — and keeps it on disk, so an RPi rebooted with the uplink
 * down still knows its bar. The price is a short lag: a tag mapped in backstage, or a card
 * handed out on the tablet, reaches the stations with the next pull.
 */
let directory: Promise<DirectoryFile> | null = null;
let writes: Promise<void> = Promise.resolve();
let version = 0;

function directoryPath(): string {
    return join(spigotCacheDir(), 'directory.json');
}

function load(): Promise<DirectoryFile> {
    return (directory ??= readFile(directoryPath(), 'utf8')
        .then((text): DirectoryFile => {
            const parsed = JSON.parse(text);
            // An older layout is a cache from a previous build: the next pull rewrites it.
            return parsed?.version === 2 ? parsed : { version: 2, bars: {} };
        })
        .catch((err: NodeJS.ErrnoException): DirectoryFile => {
            // No file is a venue that has never pulled; anything else is worth a line in
            // the log, but not worth refusing to pour over — the next pull rewrites it.
            if (err.code !== 'ENOENT') console.warn('[spigots] directory unreadable, starting empty:', err);
            return { version: 2, bars: {} };
        }));
}

async function bar(barSlug: string): Promise<BarDirectory | undefined> {
    return (await load()).bars[barSlug];
}

/** Changes whenever what the stations know changes — for caches built on top of it. */
export function directoryVersion(): number {
    return version;
}

export async function lookupBeverageTag(barSlug: string, serialId: string): Promise<Drink | null> {
    const known = await bar(barSlug);
    const key = known?.beverageTags[serialId];
    return known && key ? known.drinks[key] ?? null : null;
}

export async function lookupDrink(barSlug: string, key: string): Promise<Drink | null> {
    return (await bar(barSlug))?.drinks[key] ?? null;
}

export async function lookupCard(barSlug: string, serialId: string): Promise<Cardholder | null> {
    return (await bar(barSlug))?.cards[serialId] ?? null;
}

/** Every picture the bar's stations may need to draw. */
export async function directoryImages(barSlug: string): Promise<StoredImage[]> {
    const known = await bar(barSlug);
    if (!known) return [];

    return [...Object.values(known.drinks), ...Object.values(known.cards)]
        .map(entry => entry.image)
        .filter((image): image is StoredImage => !!image);
}

/**
 * Takes the bar from a fresh snapshot. Never throws: it rides along on the snapshot
 * request, which must not fail over a cache.
 */
export async function rememberSnapshot(
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

        const all = await load();
        if (JSON.stringify(all.bars[barSlug] ?? null) === JSON.stringify(fresh)) return false;

        all.bars[barSlug] = fresh;
        version++;

        // One write at a time, each of the whole file as it stands when its turn comes,
        // so two pulls finishing together cannot leave the older bar on disk.
        const write = writes.then(() => persist(all));
        // A failed write must not wedge the ones queued behind it.
        writes = write.catch(() => {});
        await write;
        return true;
    } catch (err) {
        console.error('[spigots] could not store the directory:', err);
        return false;
    }
}

/** Write-then-rename, so a power cut mid-write leaves the previous file, not half of one. */
async function persist(all: DirectoryFile): Promise<void> {
    const path = directoryPath();
    const temporary = `${path}.tmp`;

    await mkdir(spigotCacheDir(), { recursive: true });
    await writeFile(temporary, JSON.stringify(all, null, 2));
    await rename(temporary, path);
}
