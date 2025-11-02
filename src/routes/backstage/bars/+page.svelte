<script lang="ts">
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();
</script>

<nav class="breadcrumbs">
    <a href="/backstage/bars">Bars</a>
</nav>

<main class="backstage-content bars-page">
    <header class="page-header">
        <h2>Bars Management</h2>
        <a href="/backstage/bars/new" class="btn btn-primary">Create New Bar</a>
    </header>

    {#if data.bars.length === 0}
        <div class="empty-state">
            <p>No bars found. Create your first bar to get started.</p>
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
                            <a href="/backstage/bars/{bar.slug}" class="btn btn-secondary">Detail</a>
                        </div>
                    </div>
                </article>
            {/each}
        </div>
    {/if}
</main>
