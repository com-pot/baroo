<script lang="ts">
    import { m } from "$lib/paraglide/messages";

    const {
        online,
        syncing,
        pendingCount = 0,

        onclick,
    }: {
        online: boolean
        syncing: boolean,
        pendingCount?: number,

        onclick: () => unknown,
    } = $props()

    const syncingClass = $derived(syncing ? ' syncing' : '')

</script>

<button
    class="conn-badge{syncingClass}"
    data-online={online}
    onclick={onclick}
>
    <span class="dot" aria-hidden="true"></span>
    <span class="label">
        {online ? m["baroo.offline.online"]() : m["baroo.offline.offline"]()}
    </span>
    {#if pendingCount > 0}
        <span class="pending">{m["baroo.offline.pending"]({ count: String(pendingCount) })}</span>
    {/if}
</button>

<style lang="scss">
.conn-badge {
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

    &.syncing .dot {
        animation: conn-pulse 1s ease-in-out infinite;
    }

    .pending {
        font-weight: 600;
    }

    @keyframes conn-pulse {
        50% {
            opacity: 0.25;
        }
    }
}
</style>
