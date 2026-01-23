<script lang="ts">
    import type { BrainrotSoundPad, CpsCounter, DecayCounter, StreakCounter, TotalCounter } from "./eggs.svelte";

    // Gzt as Gen-Z toy. This captures attention and makes the number go up
    const {
        sound,
        shutUp,
        total,
        streak,
        cps,
    }: {
        sound: BrainrotSoundPad;
        shutUp?: DecayCounter;
        total: TotalCounter;
        streak: StreakCounter;
        cps: CpsCounter;
    } = $props();
</script>

<div class="lizard-grid">
    <button
        class="btn-lizard"
        onclick={() => {
            if (!shutUp?.value) sound.trigger();
            streak.trigger();
            cps.trigger();
        }}
    >
        <span>{shutUp?.value ? "🤫" : sound.icon}</span>
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
{#if shutUp}
    <button
        class="btn-shut-up"
        onclick={() => shutUp.trigger()}
        style={`--decay-remaining: ${shutUp.remainingPct.toFixed(2)};`}
    >
        Drž hubu!
    </button>
{/if}

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
