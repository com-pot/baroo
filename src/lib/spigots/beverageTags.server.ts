import { env } from '$env/dynamic/private';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { BarOfferItem } from '$lib/bar/BarModel';
import { normalizeTag } from '$lib/bar/tags';

export type BeverageTag = { key: string; name: string };

/** Beverage tag serial → the drink it stands for, per bar slug. */
type TagFile = Record<string, Record<string, BeverageTag>>;

const DEFAULT_FILE = 'data/_spigots.json';

/**
 * Which tags are drinks, as the venue server last learned it.
 *
 * A station asks on every scan, so the answer cannot wait on PocketBase. The server
 * learns it as a side effect of every kiosk snapshot pull — that request has the offer in
 * hand anyway — and keeps it on disk, so an RPi rebooted with the uplink down still knows
 * its drinks. The price is a short lag: a tag mapped in backstage starts working on the
 * next pull, which is what the staff console's sync is for.
 */
let tags: Promise<TagFile> | null = null;
let writes: Promise<void> = Promise.resolve();

function tagFilePath(): string {
    return resolve(env.SPIGOT_CACHE_FILE?.trim() || DEFAULT_FILE);
}

function load(): Promise<TagFile> {
    return (tags ??= readFile(tagFilePath(), 'utf8')
        .then((text): TagFile => JSON.parse(text))
        .catch((err: NodeJS.ErrnoException): TagFile => {
            // No file is a venue that has never pulled; anything else is worth a line in
            // the log, but not worth refusing to pour over — the next pull rewrites it.
            if (err.code !== 'ENOENT') console.warn('[spigots] beverage tags unreadable, starting empty:', err);
            return {};
        }));
}

export async function lookupBeverageTag(barSlug: string, serialId: string): Promise<BeverageTag | null> {
    return (await load())[barSlug]?.[serialId] ?? null;
}

/**
 * Takes the bar's beverage tags from a fresh copy of its offer. Never throws: it rides
 * along on the snapshot request, which must not fail over a cache.
 */
export async function rememberOfferItems(
    barSlug: string,
    offerItems: Pick<BarOfferItem, 'key' | 'name' | 'tagSerial'>[],
): Promise<void> {
    try {
        const fresh: Record<string, BeverageTag> = {};
        for (const item of offerItems) {
            const serial = normalizeTag(item.tagSerial ?? '');
            if (serial) fresh[serial] = { key: item.key, name: item.name };
        }

        const all = await load();
        if (JSON.stringify(all[barSlug] ?? {}) === JSON.stringify(fresh)) return;

        all[barSlug] = fresh;

        // One write at a time, each of the whole file as it stands when its turn comes,
        // so two pulls finishing together cannot leave the older offer on disk.
        const write = writes.then(() => persist(all));
        // A failed write must not wedge the ones queued behind it.
        writes = write.catch(() => {});
        await write;
    } catch (err) {
        console.error('[spigots] could not store beverage tags:', err);
    }
}

/** Write-then-rename, so a power cut mid-write leaves the previous file, not half of one. */
async function persist(all: TagFile): Promise<void> {
    const path = tagFilePath();
    const temporary = `${path}.tmp`;

    await mkdir(dirname(path), { recursive: true });
    await writeFile(temporary, JSON.stringify(all, null, 2));
    await rename(temporary, path);
}
