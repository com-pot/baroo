<script lang="ts">
    import { m } from "$lib/paraglide/messages";

    const {
        online,
        syncing,
        pendingCount = 0,

        onclick,
    }: {
        online: boolean
        syncing?: boolean,
        pendingCount?: number,

        onclick?: () => unknown,
    } = $props()

    const syncingClass = $derived(syncing ? ' syncing' : '')

</script>

<button
    class="connection conn-badge{syncingClass}"
    data-line={online ? 'on' : 'off'}
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

    .pending {
        font-weight: 600;
    }
}
</style>
