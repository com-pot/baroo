import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';
import Pocketbase, { ClientResponseError } from 'pocketbase';

export type Db = Pocketbase;

export function createAnonymousDb(): Db {
    const pb = new Pocketbase(env.PB_BASE_URL);
    pb.autoCancellation(false);

    return pb;
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
