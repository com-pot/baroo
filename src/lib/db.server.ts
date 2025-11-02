import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';
import Pocketbase, { ClientResponseError } from 'pocketbase';

export async function createDb(auth: { token: string }): Promise<Pocketbase> {
    try {
        const pb = new Pocketbase(env.PB_BASE_URL)
        pb.authStore.save(auth.token);
        await pb.collection('users').authRefresh({
            expand: 'roles',
        })

        return pb
    } catch (e) {
        if (e instanceof ClientResponseError) {
            return error(e.status, {
                message: `Pocketbase error: ${e.message}`,
            })
        }
        throw e
    }
    
}

export const FIXME_DEBUGGING_CREATE_DB_FROM_ENV = () => createDb({ token: env.PB_AUTH_TOKEN! });

export type Db = Pocketbase;
