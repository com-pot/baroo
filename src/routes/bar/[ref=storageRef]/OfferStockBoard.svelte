<script lang="ts">
    import "$lib/assets/styles/drawer.scss";
    import * as m from "$lib/paraglide/messages.js";
    import type { BarOfflineStore } from "$lib/offline/store.svelte";
    import type { Snippet } from "svelte";
    import { compareTaps, type OfferStock } from "$lib/bar/stats/barOfferItems";
    import StockCard from "./StockCard.svelte";
    import { packageLabel } from "$lib/bar/quantity";

    let {
        store,
        actionsMenu,
    }: {
        store: Pick<BarOfflineStore, "stock" | "packageCounts">,
        actionsMenu?: Snippet<[OfferStock, Record<string, unknown>]>,
    } = $props();

    const stockSorted = $derived(store.stock.toSorted((a, b) => {
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
            {#snippet actions(btnAttrs: Record<string, unknown>)}
                {@render actionsMenu?.(entry, btnAttrs)}
            {/snippet}

            {@const counts = store.packageCounts[entry.item.key]}

            <StockCard
                item={entry.item}
                title={entry.item.name}
                actionsMenu={actionsMenu ? actions : undefined}
            >
                <div class="package-counts">
                    {#each counts?.registered || [] as pkg}
                        <span title={m["baroo.backstage.offer.packages_registered"]()}>{packageLabel(pkg, entry.item.measure)}</span>
                    {/each}
                    {#each counts?.unsealed || [] as pkg}
                        <span class="text-primary" title={m["baroo.backstage.offer.packages_unsealed"]()}>{packageLabel(pkg, entry.item.measure)}</span>
                    {/each}
                    {#each counts?.flushed || [] as pkg}
                        <span class="text-muted text-decoration-line-through" title={m["baroo.backstage.offer.packages_flushed"]()}>{packageLabel(pkg, entry.item.measure)}</span>
                    {/each}
                    {#if !counts?.registered?.length && !counts?.unsealed?.length && !counts?.flushed?.length}
                        <span>{m["baroo.bar.stock.empty"]()}</span>
                    {/if}
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
