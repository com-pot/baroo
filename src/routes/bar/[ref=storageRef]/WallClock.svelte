<script lang="ts">
    import { onMount } from "svelte";

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
    const time = $derived(`${pad(now.getHours())}:${pad(now.getMinutes())}`);
</script>

<div class="wall-clock">
    <time datetime={time}>{time}</time>
</div>

<style lang="scss">
.wall-clock {
    padding: 0.35rem 0.9rem;
    border-radius: 999px;
    background: rgb(0 0 0 / 0.6);
    color: #fff;

    font-size: 2rem;
    font-weight: 600;
    line-height: 1;

    font-variant-numeric: tabular-nums;
}
</style>
