<script lang="ts">
    import { onMount } from "svelte";
    import {
        BrainrotSoundPad,
        CpsCounter,
        DecayCounter,
        StreakCounter,
        TotalCounter,
    } from "./eggs.svelte";

    /**
     * Gzt as Gen-Z toy. This captures attention and makes the number go up.
     *
     * The counters live here rather than on the kiosk page: nothing outside this
     * component reads them, and the page has no business holding a soundpad. The kiosk
     * only decides whether the toy exists at all — see `config.genZToy`.
     */
    const { debug = "" }: { debug?: string } = $props();

    const sound = new BrainrotSoundPad("🫧", [
        { src: "/assets/eggs/pop/bubble-pop-02-293341.mp3" },
        { src: "/assets/eggs/pop/bubble-pop-04-323580.mp3" },
        { src: "/assets/eggs/pop/bubble-pop-06-351337.mp3" },
        { src: "/assets/eggs/pop/bubble-pop-07-351339.mp3" },
        { src: "/assets/eggs/pop/pop-402323.mp3" },
    ]);

    const shutUp = new DecayCounter();

    // The lizard counter lives on the server. Offline it simply does not tick — swallow
    // the failures rather than letting them surface as unhandled rejections.
    const total = new TotalCounter({
        get: () => fetch("/api/counters/lizard").then((res) => res.json()).then((data) => data.count),
        set: (value) => {
            return fetch("/api/counters/lizard", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ delta: value }),
            })
                .then((res) => res.json())
                .then((data) => data.count);
        },
    });

    const streak = new StreakCounter({
        onExpire(num) {
            total.trigger(num);
            if (debug.includes("noCounter")) {
                return;
            }
            total.commit().catch(() => {});
        },
    });

    const cps = new CpsCounter({
        windowSizeMs: 250,
        totalTime: 5_000,
    });

    onMount(() => cps.activate());
    onMount(() => {
        total.load().catch(() => {});
    });
</script>

<div class="lizard-grid">
    <button
        class="btn-lizard"
        onclick={() => {
            if (!shutUp.value) sound.trigger();
            streak.trigger();
            cps.trigger();
        }}
    >
        <span>{shutUp.value ? "🤫" : sound.icon}</span>
    </button>

    <div
        class="counter -decay"
        data-count={streak.count}
        style="--decay-remaining: {streak.remainingPct.toFixed(2)};"
    >
        {streak.count}
    </div>

    <div class="counter -total">
        {total.value.toString().padStart(5, "0")}
    </div>

    <div
        class="counter -cps"
        style={`--phase-rate: ${cps.currentKey / cps.windows.length};`}
    >
        {cps.value}
    </div>
</div>
<button
    class="btn-shut-up"
    onclick={() => shutUp.trigger()}
    style={`--decay-remaining: ${shutUp.remainingPct.toFixed(2)};`}
>
    Drž hubu!
</button>

{#each sound.files as file (file.src)}
    <audio src={file.src} preload="auto"></audio>
{/each}

<style lang="scss">
    .counter {
        --size: 4rem;
        margin: 0 auto;

        border-radius: 50rem;
        width: var(--size);
        height: var(--size);
        display: grid;
        place-content: center;
        font-size: 2rem;
        font-weight: bold;

        box-shadow: lightgray 0px 0px 2px 2px;

        // opacity: calc(var(--decay-remaining));
        transition: opacity 0.1s linear;

        &.-decay {
            background-image: conic-gradient(
                from 0deg at center,
                orange calc(var(--decay-remaining) * 360deg - 1deg),
                transparent calc(var(--decay-remaining) * 360deg)
            );
        }
        &.-cps {
            background-image: conic-gradient(
                from calc(var(--phase-rate) * 360deg) at center,
                transparent 0deg,
                orange 60deg,
                transparent 10deg
            );
        }

        &.-total {
            width: calc(var(--size) * 1.75);
        }
    }

    .lizard-grid {
        padding-block-start: 4rem;
        display: inline-grid;
        margin: 0 auto;
        place-items: center;

        > * {
            grid-area: 1 / 1;
        }
        button {
            --size: 8rem;
            width: var(--size);
            height: var(--size);
            margin-block-start: 2rem;
        }
        .counter {
            place-self: start center;
        }
        .counter:nth-of-type(1) {
            margin-block-start: -0.5rem;
            margin-inline-start: -0.5rem;
        }
        .counter:nth-of-type(2) {
            margin-block-start: -3.5rem;
            margin-inline-start: 4rem;
        }
        .counter:nth-of-type(3) {
            margin-block-start: -0.5rem;
            margin-inline-start: 11rem;
        }
    }
    .btn-lizard {
        display: grid;
        place-content: center;

        font-size: 4rem;
        outline: 4px solid green;
        border-radius: 50rem;
        align-self: center;
        aspect-ratio: 1;

        transition: all 0.1s ease-out;

        &:active {
            outline: 4px solid green;
            outline-offset: -4px;
            scale: 0.9;
        }
    }

    .btn-shut-up {
        padding: 1rem;
        margin: 2rem;
        border-radius: 50rem;
        font-weight: bold;

        background: unset;
        background-image: linear-gradient(
            to right,
            transparent 0%,
            rgb(0, 179, 255) calc(var(--decay-remaining) * 100%),
            transparent calc(var(--decay-remaining) * 100% + 1px),
            transparent 100%
        );
    }
</style>
