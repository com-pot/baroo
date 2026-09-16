<script lang="ts">
    import * as m from "$lib/paraglide/messages.js";
    import { onMount } from "svelte";
    import type { Snippet } from "svelte";
    import { APP_VERSION, formatBuildDate } from "$lib/version";
    import type { LayoutData } from "./$types";
    import { setUiLayers, UiLayerManager } from "$lib/ui/uiLayers.svelte";
    import DrawerStack from "$lib/ui/DrawerStack.svelte";

    let { data, children }: { data: LayoutData; children: Snippet } = $props();
    const bar = data.bar;

    const layerManager = setUiLayers(new UiLayerManager())

    onMount(() => bar.watchConnectivity({
        onChange(online) {
            if (online) bar.requestSync('sync');
        }
    }))

    const pendingCount = $derived(bar.pending.length);
</script>

{#if !bar.isEnrolled}
    <div class="offline-notice">
        <p>{m["baroo.offline.not_enrolled"]()}</p>
        <a class="btn btn-primary" href="/enroll">{m["baroo.offline.enrol_link"]()}</a>
    </div>
{:else if !bar.snapshot}
    <div class="offline-notice">
        <p>{m["baroo.offline.snapshot_missing"]()}</p>
        <button class="btn btn-primary" onclick={() => bar.pull()} disabled={!!bar.syncing}>
            {bar.syncing === "pull" ? m["baroo.staff.pulling"]() : m["baroo.staff.pull"]()}
        </button>
        {#if bar.lastError}<p class="error">{bar.lastError}</p>{/if}
    </div>
{:else}
    {@render children()}
{/if}

<footer class="build-info">
    <a href="https://github.com/com-pot/baroo" target="_blank">Baroo</a>
    <span>{m["baroo.bar.build_version"]({ version: APP_VERSION })}</span>
    <span role="separator">⊙</span>
    <span>{m["baroo.bar.build_date"]({ date: formatBuildDate() })}</span>
</footer>

<div
    class="conn-badge"
    data-online={bar.online}
    data-pending={pendingCount > 0}
    data-syncing={!!bar.syncing}
>
    <span class="dot" aria-hidden="true"></span>
    <span class="label">
        {bar.online ? m["baroo.offline.online"]() : m["baroo.offline.offline"]()}
    </span>
    {#if pendingCount > 0}
        <span class="pending">{m["baroo.offline.pending"]({ count: String(pendingCount) })}</span>
    {/if}
</div>

<DrawerStack layerManager={layerManager} />

<style lang="scss">
    .offline-notice {
        min-height: 100dvh;
        display: grid;
        place-content: center;
        gap: 1rem;
        text-align: center;
        padding: 2rem;

        .error {
            color: #b00;
            font-family: monospace;
        }
    }

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

    .build-info {
        margin-block: 2rem 3rem;
        display: flex;
        justify-content: center;
        gap: 0.4rem;
        font-size: 0.75rem;
        color: #9ca3af;
        font-variant-numeric: tabular-nums;
    }
</style>
