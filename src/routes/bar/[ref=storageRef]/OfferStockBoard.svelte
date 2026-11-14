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
        store: Pick<BarOfflineStore, "stock" | "packageCounts">,
        actionsMenu?: Snippet<[OfferStock, Record<string, unknown>]>,
        /** Renders a tap an item is on - items on tap stand out when given */
        tapBadge?: Snippet<[string]>,
    } = $props();

    // On tap first, by the tap, then the rest by the latest unsealed
    const stockSorted = $derived(store.stock.toSorted((a, b) => {
        const tapA = a.package?.tap, tapB = b.package?.tap
        if (tapA || tapB) {
            if (!tapB) return -1
            if (!tapA) return 1
            return compareTaps(tapA, tapB)
        }
        const unsealedA = a.package?.unsealedAt, unsealedB = b.package?.unsealedAt
        if (!unsealedA && !unsealedB) return 0
        if (!unsealedB) return -1
        if (!unsealedA) return 1
        return -unsealedA.localeCompare(unsealedB)
    }))
</script>

<section class="stock-board" data-boot>
    <h2>{m["baroo.bar.stock.title"]()}</h2>

    <div class="items-grid -tight" style="--item-size: 18rem;">
        {#each stockSorted as entry (entry.package?.id ?? entry.item.key)}
            {@const tap = entry.package?.tap}
            {@const onTap = !!tapBadge && !!tap}
            {#snippet badge()}
                {#if tap}
                    {@render tapBadge?.(tap)}
                {/if}
            {/snippet}
            {#snippet actions(btnAttrs: Record<string, unknown>)}
                {@render actionsMenu?.(entry, btnAttrs)}
            {/snippet}

            {@const counts = store.packageCounts[entry.item.key]}

            <StockCard
                item={entry.item}
                title={entry.item.name}
                highlight={onTap}
                badge={onTap ? badge : undefined}
                actionsMenu={actionsMenu ? actions : undefined}
            >
                <div class="package-counts">
                    <span title={m["baroo.backstage.offer.packages_registered"]()}>{counts?.registered ?? 0}</span>
                    <span class="text-primary" title={m["baroo.backstage.offer.packages_unsealed"]()}>{counts?.unsealed ?? 0}</span>
                    <span class="text-muted" title={m["baroo.backstage.offer.packages_flushed"]()}>{counts?.flushed ?? 0}</span>
                </div>
            </StockCard>
        {:else}
        <div class="card empty-state">
            <p>{m["baroo.bar.stock.empty"]()}</p>
        </div>
        {/each}
    </div>
</section>

<style lang="scss">
    .package-counts {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.1em 0.5em;
        font-variant-numeric: tabular-nums;

        background-color: rgba(var(--bs-body-bg-rgb), 0.6);
        border: 1px solid var(--bs-card-border-color);
        border-radius: var(--bs-card-border-radius);
        backdrop-filter: blur(4px);
    }
</style>
