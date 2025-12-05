<script lang="ts">
    import * as m from '$lib/paraglide/messages.js';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();
</script>

<nav class="breadcrumbs">
    <a href="/backstage/bars">{m["baroo.backstage.bars.breadcrumb"]()}</a>
</nav>

<main class="backstage-content bars-page">
    <header class="page-header">
        <h2>{m["baroo.backstage.bars.list_title"]()}</h2>
        <a href="/backstage/bars/new" class="btn btn-primary">{m["baroo.backstage.bars.create_new"]()}</a>
    </header>

    {#if data.bars.length === 0}
        <div class="empty-state">
            <p>{m["baroo.backstage.bars.no_bars"]()}</p>
        </div>
    {:else}
        <div class="items-grid">
            {#each data.bars as bar}
                <article class="card">
                    <div class="card-body">
                        <h3>{bar.name}</h3>
                        <p class="bar-slug">/{bar.slug}</p>
                    </div>
                    <div class="card-footer">
                        <div class="actions">
                            <a href="/backstage/bars/{bar.slug}" class="btn btn-secondary">{m["baroo.backstage.bars.detail"]()}</a>
                        </div>
                    </div>
                </article>
            {/each}
        </div>
    {/if}
</main>
