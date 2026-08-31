import { OfflineBar } from '$lib/offline/store.svelte';
import type { LayoutLoad } from './$types';

/**
 * The kiosk renders entirely in the browser.
 *
 * There is no server at the venue, so nothing here may depend on one. Turning SSR off
 * also means every `/bar/*` URL is served the same empty shell, which is what lets one
 * cached document satisfy any bar the tablet is enrolled for.
 */
export const ssr = false;

export const load: LayoutLoad = async ({ params }) => {
    const bar = new OfflineBar(params.ref);
    await bar.load();

    return { bar, ref: params.ref };
};
