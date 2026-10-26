import { env } from '$env/dynamic/private';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spigotCacheDir, type StoredImage } from './spigotDirectory.server';

const FETCH_TIMEOUT_MS = 10_000;

let version = 0;
const fetching = new Map<string, Promise<Buffer | null>>();

/**
 * Member photos and drink pictures, kept on the venue server's disk for the station
 * displays.
 *
 * They live in PocketBase, which may be out of reach exactly when a customer taps, so
 * they are fetched ahead — whenever a kiosk pull shows a picture the server has not got —
 * and read from disk at drawing time. PocketBase gives every upload a fresh filename, so
 * the filename doubles as the cache key and a replaced photo is simply a new file.
 */
export async function readImage(image: StoredImage): Promise<Buffer | null> {
    try {
        return await readFile(imagePath(image));
    } catch {
        // Not here yet. A station is waiting on this screen and PocketBase may be gone, so
        // this one goes without; the fetch makes the next screen complete.
        void fetchImage(image);
        return null;
    }
}

/** Fetches whatever is missing, one at a time. For running in the background. */
export async function warmImages(images: StoredImage[]): Promise<void> {
    for (const image of images) {
        try {
            await readFile(imagePath(image));
        } catch {
            await fetchImage(image);
        }
    }
}

/** Changes whenever a picture arrives — a screen drawn without it is out of date. */
export function imagesVersion(): number {
    return version;
}

function fetchImage(image: StoredImage): Promise<Buffer | null> {
    const path = imagePath(image);

    let pending = fetching.get(path);
    if (!pending) {
        pending = download(image, path).finally(() => fetching.delete(path));
        fetching.set(path, pending);
    }
    return pending;
}

async function download(image: StoredImage, path: string): Promise<Buffer | null> {
    const base = env.PB_BASE_URL?.replace(/\/$/, '');
    if (!base) return null;

    const url = `${base}/api/files/${image.collection}/${image.recordId}/${encodeURIComponent(image.filename)}`;
    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
        if (!response.ok) {
            console.warn(`[spigots] picture ${image.filename}: HTTP ${response.status}`);
            return null;
        }

        const bytes = Buffer.from(await response.arrayBuffer());
        await mkdir(join(spigotCacheDir(), 'img'), { recursive: true });
        await writeFile(`${path}.tmp`, bytes);
        await rename(`${path}.tmp`, path);

        version++;
        return bytes;
    } catch (err) {
        // Offline is the normal reason, and the screen simply goes without the picture.
        console.warn(`[spigots] picture ${image.filename} unavailable:`, err instanceof Error ? err.message : err);
        return null;
    }
}

function imagePath(image: StoredImage): string {
    const name = `${image.collection}-${image.recordId}-${image.filename}`.replace(/[^A-Za-z0-9._-]/g, '_');
    return join(spigotCacheDir(), 'img', name);
}
