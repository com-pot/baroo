<script lang="ts">
    import type { BarOfflineStore } from "$lib/offline/store.svelte";
    import type StoreSync from "$lib/offline/StoreSync.svelte";
    import SyncWidget from "./SyncWidget.svelte";

    const {
        store,
        barSync,
    }: {
        store: BarOfflineStore,
        barSync: StoreSync,
    } = $props()

</script>

<SyncWidget {store} {barSync} />
