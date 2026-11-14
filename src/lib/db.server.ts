import { error } from '@sveltejs/kit';
import Pocketbase, { ClientResponseError, getTokenPayload, isTokenExpired } from 'pocketbase';
import { appError } from './errors';

export type Db = Pocketbase;

const USERS_COLLECTION_ID = '_pb_users_auth_';

export function createAnonymousDb(env: NodeJS.ProcessEnv): Db {
    const pb = new Pocketbase(env.PB_BASE_URL);
    pb.autoCancellation(false);

    return pb;
}

export function createTokenDb(env: NodeJS.ProcessEnv, token: string | undefined): Db {
    if (!token) {
        throw appError('missing-authorisation', {status: 401})
    }
    if (isTokenExpired(token)) {
        throw appError('authorisation-expired', {status: 401})
    }

    const pb = createAnonymousDb(env);
    pb.authStore.save(token);

    return pb;
}

/** Acting as whoever the `Authorization` header's bearer token is of, users with their roles */
export async function createDb(env: NodeJS.ProcessEnv, auth: { header: string | null }): Promise<Db> {
    const token = auth.header?.replace(/^Bearer /i, '').trim();
    if (!token) error(401, 'missing-authorisation');
    if (isTokenExpired(token)) error(401, 'authorisation-expired');

    try {
        const pb = createAnonymousDb(env)
        pb.authStore.save(token);
        // Only the token is known here, so the users collection goes by its id
        if (getTokenPayload(token).collectionId === USERS_COLLECTION_ID) {
            await pb.collection('users').authRefresh({
                expand: 'roles',
            })
        }

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
