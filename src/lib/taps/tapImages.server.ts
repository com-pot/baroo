import { env } from '$env/dynamic/private';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/** A PocketBase file, the filename changes on every upload */
export type StoredImage = { collection: string; recordId: string; filename: string };

export function tapCacheDir(): string {
    return resolve(env.TAP_CACHE_DIR?.trim() || 'data/_taps');
}

const FETCH_TIMEOUT_MS = 10_000;

let version = 0;
const fetching = new Map<string, Promise<Buffer | null>>();

/**
 * Pictures for the TapTapper displays, cached on disk - every screen redraw would fetch them
 * from PocketBase otherwise
 */
export async function readImage(ctx: Pick<App.Locals, "logger">, image: StoredImage): Promise<Buffer | null> {
    try {
        return await readFile(imagePath(image));
    } catch {
        // Drawn without it this time, the next screen will have it
        void fetchImage(ctx, image);
        return null;
    }
}

/** Changes with every downloaded picture */
export function imagesVersion(): number {
    return version;
}

function fetchImage(ctx: Pick<App.Locals, "logger">, image: StoredImage): Promise<Buffer | null> {
    const path = imagePath(image);

    let pending = fetching.get(path);
    if (!pending) {
        pending = download(ctx, image, path).finally(() => fetching.delete(path));
        fetching.set(path, pending);
    }
    return pending;
}

async function download(ctx: Pick<App.Locals, "logger">, image: StoredImage, path: string): Promise<Buffer | null> {
    const base = env.PB_BASE_URL?.replace(/\/$/, '');
    if (!base) return null;

    const url = `${base}/api/files/${image.collection}/${image.recordId}/${encodeURIComponent(image.filename)}`;
    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
        if (!response.ok) {
            ctx.logger.warn(`[taps] picture ${image.filename}: HTTP ${response.status}`);
            return null;
        }

        const bytes = Buffer.from(await response.arrayBuffer());
        await mkdir(join(tapCacheDir(), 'img'), { recursive: true });
        await writeFile(`${path}.tmp`, bytes);
        await rename(`${path}.tmp`, path);

        version++;
        return bytes;
    } catch (err) {
        ctx.logger.warn(`[taps] picture ${image.filename} unavailable: ${err instanceof Error ? err.message : err}`);
        return null;
    }
}

function imagePath(image: StoredImage): string {
    const name = `${image.collection}-${image.recordId}-${image.filename}`.replace(/[^A-Za-z0-9._-]/g, '_');
    return join(tapCacheDir(), 'img', name);
}
