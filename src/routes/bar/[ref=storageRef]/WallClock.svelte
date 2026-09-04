<script lang="ts">
    import * as m from "$lib/paraglide/messages.js";
    import { onMount } from "svelte";

    /**
     * The time, in its own corner. A tablet parked in kiosk mode hides the system
     * status bar, so this is the only clock in the room — and "how long till last
     * orders" is asked across the bar all evening.
     */
    let now = $state(new Date());

    onMount(() => {
        let timer: ReturnType<typeof setTimeout>;

        const tick = () => {
            now = new Date();
            timer = setTimeout(tick, 60_000 - (now.getTime() % 60_000));
        };
        tick();

        return () => clearTimeout(timer);
    });

    const pad = (value: number) => String(value).padStart(2, "0");

    // Padded by hand rather than through Intl: the kiosk runs in whichever locale the
    // bar is set to, and this face is 24h HH:MM in all of them.
    const time = $derived(`${pad(now.getHours())}:${pad(now.getMinutes())}`);
</script>

<div class="wall-clock">
    <time datetime={time} aria-label={m["baroo.bar.clock_label"]({ time })}>{time}</time>
</div>

<style lang="scss">
.wall-clock {
    position: fixed;
    inset-block-start: 0.5rem;
    inset-inline-start: 0.5rem;
    // Level with the connectivity badge in the opposite corner, so the boot overlay
    // dims the page without swallowing either of them.
    z-index: 50;

    padding: 0.35rem 0.9rem;
    border-radius: 999px;
    background: rgb(0 0 0 / 0.6);
    color: #fff;

    font-size: 2rem;
    font-weight: 600;
    line-height: 1;
    // Keeps the pill from twitching as the digits change width.
    font-variant-numeric: tabular-nums;
}
</style>
