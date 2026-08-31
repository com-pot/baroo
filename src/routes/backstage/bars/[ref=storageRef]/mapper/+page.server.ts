import { loadBarData } from "$lib/bar/storage.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, locals, parent }) => {
    // The bar comes from the section layout; only the rest is fetched here.
    const { bar } = await parent();

    const data = await loadBarData(locals.pb, params['ref'], bar ?? undefined)

    return {
        ...data,
    };
}
