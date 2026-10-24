<script lang="ts">
    import * as m from "$lib/paraglide/messages.js";
    import { onMount } from "svelte";
    import type { BarOfferItem } from "$lib/bar/BarModel";
    import { SPIGOT_STALE_MS } from "$lib/spigots/spigotEvents";
    import type { SpigotStream } from "$lib/spigots/spigotStream.svelte";

    const {
        stream,
        offerItems,
    }: {
        stream: SpigotStream;
        offerItems: BarOfferItem[];
    } = $props();

    // A station going quiet is a matter of time passing, which nothing else here notices.
    let now = $state(Date.now());
    onMount(() => {
        const timer = setInterval(() => (now = Date.now()), 5_000);
        return () => clearInterval(timer);
    });

    function drinkName(key: string | null): string {
        if (!key) return m["baroo.bar.spigot.no_beverage"]();
        return offerItems.find((item) => item.key === key)?.name ?? key;
    }
</script>

{#if !stream.connected || stream.spigots.length}
    <ul class="spigot-roster" data-connected={stream.connected}>
        {#if !stream.connected}
            <li class="lost">⚠️ {m["baroo.bar.spigot.disconnected"]()}</li>
        {/if}
        {#each stream.spigots as station (station.spigot)}
            <li data-alive={stream.connected && now - station.heardAt < SPIGOT_STALE_MS}>
                <span class="dot" aria-hidden="true"></span>
                <span class="spigot">{m["baroo.bar.spigot.title"]({ spigot: station.spigot })}</span>
                <span class="drink" class:none={!station.beverage}>{drinkName(station.beverage)}</span>
            </li>
        {/each}
    </ul>
{/if}

<style lang="scss">
    .spigot-roster {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin: 0;
        padding: 0;
        list-style: none;
        font-size: 0.9rem;

        li {
            display: flex;
            align-items: center;
            gap: 0.4rem;
            padding: 0.35rem 0.75rem;
            border-radius: 999px;
            background-color: #f3f4f6;
        }

        .dot {
            width: 0.6rem;
            height: 0.6rem;
            border-radius: 50%;
            background: #d9534f;
        }

        [data-alive="true"] .dot {
            background: #5cb85c;
        }

        .spigot {
            font-weight: 600;
        }

        .drink.none {
            color: #9ca3af;
            font-style: italic;
        }

        .lost {
            background-color: #fefce8;
        }
    }
</style>
