<script lang="ts">
    import type { OfflineBar } from "$lib/offline/store.svelte";
    import SyncWidget from "./SyncWidget.svelte";

    const {
        bar,
    }: {
        bar: OfflineBar,
    } = $props()

</script>

<SyncWidget {bar} />
