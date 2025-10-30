import { loadBarData } from "$lib/bar/storage.server";
import { FIXME_DEBUGGING_CREATE_DB_FROM_ENV } from "$lib/db.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params }) => {
    const db = await FIXME_DEBUGGING_CREATE_DB_FROM_ENV()
    const data = await loadBarData(db, params['ref'])

    return {
        ...data,
    };
}
