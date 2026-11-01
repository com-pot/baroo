<script lang="ts">
    import * as m from "$lib/paraglide/messages.js";
    import { onMount, type Snippet } from "svelte";
    import type { BarOfferItem } from "$lib/bar/BarModel";
    import { servingPreset } from "$lib/bar/servings";
    import { TAP_STALE_MS } from "$lib/taps/tapEvents";
    import type { HeardTap, TapStream } from "$lib/taps/tapStream.svelte";
    import StockCard from "./StockCard.svelte";
    import TapBadge from "./TapBadge.svelte";

    const {
        stream,
        offerItems,
        actionsMenu,
    }: {
        stream: TapStream,
        offerItems: BarOfferItem[],
        actionsMenu?: Snippet<[HeardTap, Record<string, unknown>]>,
    } = $props();

    // Ticks so TapTappers that went quiet show as stale
    let now = $state(Date.now());
    onMount(() => {
        const timer = setInterval(() => (now = Date.now()), 5_000);
        return () => clearInterval(timer);
    });

    function alive(tap: HeardTap): boolean | null {
        if (tap.heardAt === null) return null;
        return stream.connected && now - tap.heardAt < TAP_STALE_MS;
    }
</script>

{#if !stream.connected || stream.taps.length}
    <section class="tap-lineup">
        <h2>{m["baroo.bar.tap.lineup_title"]()}</h2>

        {#if !stream.connected}
            <p class="lost">⚠️ {m["baroo.bar.tap.disconnected"]()}</p>
        {/if}

        <div class="items-grid -tight" style="--item-size: 15rem;">
            {#each stream.taps as tap (tap.tap)}
                {@const item = offerItems.find((candidate) => candidate.key === tap.offerItemKey) ?? null}
                {#snippet badge()}
                    <TapBadge tap={tap.tap} alive={alive(tap)} />
                {/snippet}
                {#snippet actions(btnAttrs: Record<string, unknown>)}
                    {@render actionsMenu?.(tap, btnAttrs)}
                {/snippet}

                <StockCard
                    {item}
                    title={item?.name ?? tap.offerItemKey ?? m["baroo.bar.tap.nothing_on_tap"]()}
                    measure={item ? servingPreset(item.servingPreset).measure : "volume"}
                    left={tap.stock?.left ?? null}
                    total={tap.stock?.quantity ?? 0}
                    empty={tap.offerItemKey ? m["baroo.bar.stock.not_unsealed"]() : m["baroo.bar.tap.nothing_on_tap"]()}
                    highlight={!!tap.offerItemKey}
                    {badge}
                    actionsMenu={actionsMenu ? actions : undefined}
                />
            {/each}
        </div>
    </section>
{/if}

<style lang="scss">
    .tap-lineup {
        h2 {
            font-size: 1.25rem;
        }
    }

    .lost {
        padding: 0.35rem 0.75rem;
        border-radius: 0.5rem;
        background-color: #fefce8;
    }
</style>
