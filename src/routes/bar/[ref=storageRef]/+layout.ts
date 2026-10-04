import { OfflineBar } from '$lib/offline/store.svelte';
import type { LayoutLoad } from './$types';

export const ssr = false;

export const load: LayoutLoad = async ({ params }) => {
    const bar = new OfflineBar(params.ref);
    await bar.load();

    return { bar, ref: params.ref };
};
