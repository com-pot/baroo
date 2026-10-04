import LineCheck from '$lib/offline/lineCheck.svelte';
import { BarOfflineStore } from '$lib/offline/store.svelte';
import StoreSync from '$lib/offline/StoreSync.svelte';
import { redirect } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';
import { resolve } from '$app/paths';

export const ssr = false;

export const load: LayoutLoad = async ({ params }) => {
    const bar = new BarOfflineStore(params.ref, new LineCheck(), {
        onProcessed: () => barSync.requestSync(),
    });
    await bar.load();
    if (!bar.isEnrolled) {
        return redirect(302, resolve("/enroll"))
    }

    const barSync = new StoreSync(bar) as StoreSync
    await barSync.init()

    return { bar, barSync, ref: params.ref };
};
