<script lang="ts">
    import * as m from '$lib/paraglide/messages.js';
    import type { PageData } from './$types';
    import { servingPreset, servingsOf, servingText } from '$lib/bar/servings';

    let { data }: { data: PageData } = $props();
</script>

<svelte:head>
    <title>{m["baroo.backstage.price_list.title"]()}</title>
</svelte:head>

<main class="backstage-content" data-page="bar.price-list">
    <header class="page-header">
        <h2>{m["baroo.backstage.price_list.title"]()}</h2>
    </header>

    {#if data.items.length === 0}
        <div class="empty-state">
            <p>{m["baroo.backstage.price_list.no_items"]()}</p>
        </div>
    {:else}
        <div class="info-sections">
            {#each data.items as item (item.id)}
                {@const priced = servingsOf(item).filter((serving) => item.pricing?.[serving.key] != null)}
                {@const measure = servingPreset(item).measure}
                <div class="card info-card">
                    <div class="card-header">
                        <span class="title">{item.name}</span>
                    </div>
                    <div class="card-body">
                        {#if priced.length}
                            <ul class="servings">
                                {#each priced as serving (serving.key)}
                                    <li class="serving">
                                        <span class="size">{servingText(serving, measure)}</span>
                                        <span role="separator">–</span>
                                        <span class="price">{item.pricing[serving.key]} Kč</span>
                                    </li>
                                {/each}
                            </ul>
                        {:else}
                            <span class="text-muted">{m["baroo.backstage.price_list.no_pricing"]()}</span>
                        {/if}
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</main>

<style lang="scss">
.servings {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1.5rem;
    list-style: none;
    margin: 0;
    padding: 0;

    .serving {
        display: flex;
        gap: 0.4rem;
    }

    .size {
        font-weight: 600;
    }
}

// The list is meant to end up on the bar counter.
@media print {
    :global(nav.breadcrumbs),
    :global(.bar-tabs) {
        display: none;
    }
}
</style>
