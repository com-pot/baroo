import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';
import Pocketbase, { ClientResponseError, getTokenPayload, isTokenExpired } from 'pocketbase';

export type Db = Pocketbase;

export function createAnonymousDb(): Db {
    const pb = new Pocketbase(env.PB_BASE_URL);
    pb.autoCancellation(false);

    return pb;
}

export function createTokenDb(token: string): Db {
    const pb = createAnonymousDb();
    pb.authStore.save(token);

    return pb;
}

export type SuperuserStatus = 'ready' | 'missing' | 'expired';

export function superuserStatus(): SuperuserStatus {
    const token = env.PB_SU_TOKEN;
    if (!token) return 'missing';

    return isTokenExpired(token) ? 'expired' : 'ready';
}

/** When the configured token lapses, for backstage to show. */
export function superuserTokenExpiresAt(): string | null {
    const exp = getTokenPayload(env.PB_SU_TOKEN ?? '').exp;

    return typeof exp === 'number' ? new Date(exp * 1000).toISOString() : null;
}

/**
 * The superuser client, or `null` when the token is missing or spent.
 *
 * Only device pairing needs this — nothing on a normal request path may call it, and
 * nothing calls it at import time, so an unreachable PocketBase still serves the offline
 * kiosk shell. Whether the token really belongs to `_superusers` is left to PocketBase:
 * checking here would mean hardcoding its system collection id.
 */
export async function superuserDb(): Promise<Db | null> {
    if (superuserStatus() !== 'ready') return null;

    return createTokenDb(env.PB_SU_TOKEN!);
}

export async function createDb(auth: { token: string }): Promise<Db> {
    try {
        const pb = createAnonymousDb()
        pb.authStore.save(auth.token);
        await pb.collection('users').authRefresh({
            expand: 'roles',
        })

        return pb
    } catch (e) {
        if (e instanceof ClientResponseError) {
            return error(e.status || 500, {
                message: `Pocketbase error: ${e.message}`,
            })
        }
        throw e
    }
}

export function readRoles(record: unknown): string[] {
    const expand = (record as { expand?: { roles?: { name?: string }[] } } | null)?.expand;
    return (expand?.roles || []).map(role => role.name).filter((n): n is string => !!n);
}

export function formatPbError(err: unknown): null | { errors: Record<string, string> } {
    if (err instanceof ClientResponseError && err.status === 400 && err.data?.data) {
        const pbErrors: Record<string, string> = {};
        for (const field of Object.keys(err.data.data)) {
            pbErrors[field] = err.data.data[field].message;
        }

        return { errors: pbErrors }
    }

    return null
}
