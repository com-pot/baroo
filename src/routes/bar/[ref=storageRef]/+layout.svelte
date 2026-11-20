<script lang="ts">
    import { onMount } from "svelte";
    import type { LayoutProps } from "./$types";
    import * as m from "$lib/paraglide/messages.js";
    import SyncDrawer from "./SyncDrawer.svelte";
    import BuildInfo from "$lib/components/BuildInfo.svelte";

    import { resolve } from "$app/paths";
    import ConnectionBadge from "$lib/components/ConnectionBadge.svelte";
    import { getUiLayers } from "$lib/ui/uiLayers.svelte";

    const uiLayers = getUiLayers()

    let { data, children, params }: LayoutProps = $props();
    const store = $derived(data.bar);
    const barSync = $derived(data.barSync)

    onMount(() => store.lineCheck.watchConnectivity({
        onChange(online) {
            if (online) barSync.requestSync('sync');
        }
    }))
</script>

{#if !store.isEnrolled}
    <span>{m["generic.loading"]()}</span>
{:else if !store.snapshot}
    {@const authorizedBar = barSync.lastError?.details?.authorizedBar}
    <div class="empty-state -full">
        {#if authorizedBar}
            <p>{m["baroo.pos.enrollment.device-bar-mismatch"]()}</p>
            <div class="actions">
                <a class="btn btn-link" href={resolve(`/bar/${authorizedBar}`)}>
                    {m["baroo.pos.enrollment.visitEnrolledBar"]()}
                </a>
            </div>
        {:else}
            <p>{m["baroo.offline.snapshot_missing"]()}</p>
            <div class="actions">
                <button class="btn btn-primary" onclick={() => barSync.requestSync("sync")} disabled={!!barSync.syncing}>
                    {barSync.syncing === "pull" ? m["baroo.staff.pulling"]() : m["baroo.staff.pull"]()}
                </button>
            </div>
            {#if barSync.lastError}
                <p class="error">{barSync.lastError.message}</p>
                {#if barSync.lastError.details}
                <code><pre>{JSON.stringify(barSync.lastError.details)}</pre></code>
                {/if}
            {/if}
        {/if}
    </div>
{:else}
    {@render children()}
{/if}

<footer>
    <BuildInfo />
</footer>

<ConnectionBadge
    online={store.lineCheck.online}
    syncing={!!barSync.syncing}
    pendingCount={store.pending.length}

    onclick={() => uiLayers.pushComponent(SyncDrawer, {
        store,
        barSync,
    }, {
        heading: m["baroo.staff.sync_section"](),
    })}
/>

<style lang="scss">
:global(#app-root .conn-badge) {
    position: fixed;
    inset-block-end: 0.5rem;
    inset-inline-start: 0.5rem;
    z-index: 50;
}

</style>
