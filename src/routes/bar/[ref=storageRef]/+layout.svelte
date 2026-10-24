<script lang="ts">
    import * as m from "$lib/paraglide/messages.js";
    import { onMount } from "svelte";
    import type { Snippet } from "svelte";
    import type { LayoutData } from "./$types";
    import { setUiLayers, UiLayerManager } from "$lib/ui/uiLayers.svelte";
    import LayerStack from "$lib/ui/LayerStack.svelte";
    import SyncDrawer from "./SyncDrawer.svelte";
    import BuildInfo from "$lib/components/BuildInfo.svelte";
    import Dialog from "$lib/components/Dialog.svelte";

    let { data, children }: { data: LayoutData; children: Snippet } = $props();
    const store = $derived(data.bar);
    const barSync = $derived(data.barSync)

    const layerManager = setUiLayers(new UiLayerManager(['dialog']))

    onMount(() => store.lineCheck.watchConnectivity({
        onChange(online) {
            if (online) barSync.requestSync('sync');
        }
    }))

    const pendingCount = $derived(store.pending.length);
</script>

{#if !store.isEnrolled}
    <span>{m["generic.loading"]()}</span>
{:else if !store.snapshot}
    <div class="empty-state -full">
        <p>{m["baroo.offline.snapshot_missing"]()}</p>
        <div class="actions">
            <button class="btn btn-primary" onclick={() => barSync.pull()} disabled={!!barSync.syncing}>
                {barSync.syncing === "pull" ? m["baroo.staff.pulling"]() : m["baroo.staff.pull"]()}
            </button>
        </div>
        {#if barSync.lastError}<p class="error">{barSync.lastError}</p>{/if}
    </div>
{:else}
    {@render children()}
{/if}

<footer>
    <BuildInfo />
</footer>

<button
    class="conn-badge"
    data-online={store.lineCheck.online}
    data-pending={pendingCount > 0}
    data-syncing={!!barSync.syncing}
    onclick={() => layerManager.pushComponent(SyncDrawer, {
        store,
        barSync,
    }, {
        heading: m["baroo.staff.sync_section"](),
    })}
>
    <span class="dot" aria-hidden="true"></span>
    <span class="label">
        {store.lineCheck.online ? m["baroo.offline.online"]() : m["baroo.offline.offline"]()}
    </span>
    {#if pendingCount > 0}
        <span class="pending">{m["baroo.offline.pending"]({ count: String(pendingCount) })}</span>
    {/if}
</button>

<LayerStack layerManager={layerManager} />
<LayerStack layerManager={layerManager} scope="dialog" component={Dialog} />

<style lang="scss">
    .conn-badge {
        position: fixed;
        inset-block-end: 0.5rem;
        inset-inline-end: 0.5rem;
        z-index: 50;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.35rem 0.75rem;
        border-radius: 999px;
        font-size: 0.85rem;
        background: rgb(0 0 0 / 0.6);
        color: #fff;

        .dot {
            width: 0.6rem;
            height: 0.6rem;
            border-radius: 50%;
            background: #5cb85c;
        }

        &[data-online="false"] .dot {
            background: #d9534f;
        }

        &[data-syncing="true"] .dot {
            animation: conn-pulse 1s ease-in-out infinite;
        }

        &[data-pending="true"] .pending {
            font-weight: 600;
        }

        @keyframes conn-pulse {
            50% {
                opacity: 0.25;
            }
        }

        .staff-link {
            color: inherit;
            background: none;
            border: 0;
            padding: 0;
            font: inherit;
            text-decoration: underline;
        }
    }

    footer {
        margin-block: 2rem 3rem;

        :global(.build-info) {
            display: flex;
            justify-content: center;
            gap: 0.4rem;
            font-size: 0.75rem;
            color: #9ca3af;
            font-variant-numeric: tabular-nums;
        }
    }
</style>
