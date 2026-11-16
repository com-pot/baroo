<script lang="ts">
    import * as m from "$lib/paraglide/messages.js";

    const {
        tap,
        label,
        alive = null,
    }: {
        tap: string,
        /** The tap's name, when known */
        label?: string,
        /** Whether the TapTapper at the tap checks in, `null` for a tap without one */
        alive?: boolean | null,
    } = $props();
</script>

<span
    class="tap-badge connection"
    data-line={typeof alive === 'boolean' ? (alive ? 'on' : 'off') : undefined}
    title={alive === null ? undefined : alive ? m["baroo.bar.tap.tapper_alive"]() : m["baroo.bar.tap.tapper_quiet"]()}
>
    <span class="dot" aria-hidden="true"></span>
    <span>{label || m["baroo.bar.tap.title"]({ tap })}</span>
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
</style>
