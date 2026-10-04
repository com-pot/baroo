import { loadBarData } from "$lib/bar/storage.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, locals, parent }) => {
    const { bar } = await parent();

    const data = await loadBarData(locals.pb, params['ref'], bar ?? undefined)

    return {
        ...data,
    };
}
