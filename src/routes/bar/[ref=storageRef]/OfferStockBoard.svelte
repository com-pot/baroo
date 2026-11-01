<script lang="ts">
    import "$lib/assets/styles/drawer.scss";
    import * as m from "$lib/paraglide/messages.js";
    import type { BarOfflineStore } from "$lib/offline/store.svelte";
    import type { Snippet } from "svelte";
    import { compareTaps, type OfferStock } from "$lib/bar/stats/barOfferItems";
    import StockCard from "./StockCard.svelte";

    let {
        store,
        actionsMenu,
        tapBadge,
    }: {
        store: Pick<BarOfflineStore, "stock">,
        actionsMenu?: Snippet<[OfferStock, Record<string, unknown>]>,
        /** Renders a tap an item is on - items on tap stand out when given */
        tapBadge?: Snippet<[string]>,
    } = $props();

    // On tap first, by the tap, then the rest by the latest unsealed
    const stockSorted = $derived(store.stock.toSorted((a, b) => {
        if (a.taps.length || b.taps.length) {
            if (!b.taps.length) return -1
            if (!a.taps.length) return 1
            return compareTaps(a.taps[0], b.taps[0])
        }
        if (!a.unsealedAt && !b.unsealedAt) return 0
        if (!b.unsealedAt) return -1
        if (!a.unsealedAt) return 1
        return -a.unsealedAt.localeCompare(b.unsealedAt)
    }))
</script>

<section class="stock-board" data-boot>
    <h2>{m["baroo.bar.stock.title"]()}</h2>

    <div class="items-grid -tight" style="--item-size: 18rem;">
        {#each stockSorted as entry (entry.item.key)}
            {@const onTap = !!tapBadge && entry.taps.length > 0}
            {#snippet badge()}
                {#each entry.taps as tap (tap)}
                    {@render tapBadge?.(tap)}
                {/each}
            {/snippet}
            {#snippet actions(btnAttrs: Record<string, unknown>)}
                {@render actionsMenu?.(entry, btnAttrs)}
            {/snippet}

            <StockCard
                item={entry.item}
                title={entry.item.name}
                measure={entry.measure}
                left={entry.left}
                total={entry.unsealQuantity}
                empty={m["baroo.bar.stock.not_unsealed"]()}
                highlight={onTap}
                badge={onTap ? badge : undefined}
                actionsMenu={actionsMenu ? actions : undefined}
            />
        {:else}
        <div class="card empty-state">
            <p>{m["baroo.bar.stock.empty"]()}</p>
        </div>
        {/each}
    </div>
</section>
