<script lang="ts">
    import * as m from "$lib/paraglide/messages.js";

    const {
        tap,
        alive = null,
    }: {
        tap: string,
        /** Whether the TapTapper at the tap checks in, `null` for a tap without one */
        alive?: boolean | null,
    } = $props();
</script>

<span
    class="tap-badge"
    data-alive={alive ?? undefined}
    title={alive === null ? undefined : alive ? m["baroo.bar.tap.tapper_alive"]() : m["baroo.bar.tap.tapper_quiet"]()}
>
    {#if alive !== null}
        <span class="dot" aria-hidden="true"></span>
    {/if}
    {m["baroo.bar.tap.title"]({ tap })}
</span>

<style lang="scss">
    .tap-badge {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        padding: 0.1rem 0.55rem;
        border-radius: 999px;
        background-color: rgb(var(--bs-primary-rgb), 0.12);
        color: rgb(var(--bs-primary-rgb));
        font-size: 0.8rem;
        font-weight: 700;
        white-space: nowrap;
    }

    .dot {
        width: 0.55rem;
        height: 0.55rem;
        border-radius: 50%;
        background: #d9534f;
    }

    [data-alive="true"] .dot {
        background: #5cb85c;
    }
</style>
