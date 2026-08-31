<script lang="ts">
    import * as m from "$lib/paraglide/messages.js";
    import { onMount } from "svelte";
    import type { Snippet } from "svelte";
    import type { LayoutData } from "./$types";
    import Drawer from "$lib/components/Drawer.svelte";
    import StaffDrawer from "./StaffDrawer.svelte";

    let { data, children }: { data: LayoutData; children: Snippet } = $props();
    const bar = data.bar;

    /**
     * The barman's console rides over the kiosk rather than replacing it — opening it
     * mid-order no longer tears down the half-built order behind it.
     */
    let staffOpen = $state(false);

    // Ops push themselves as they are made; this catches up whatever was buffered while
    // the tablet had no signal, and refreshes the snapshot on the way back in.
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
    {#if bar.isStaffDevice && bar.snapshot}
        <button type="button" class="staff-link" onclick={() => (staffOpen = true)}>
            {m["baroo.staff.title"]()}
        </button>
    {/if}
</div>

{#if staffOpen}
    <Drawer bind:isOpen={staffOpen}>
        {#snippet heading()}{m["baroo.staff.title"]()} — {bar.snapshot?.bar.name}{/snippet}
        <StaffDrawer {bar} />
    </Drawer>
{/if}

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
</style>
