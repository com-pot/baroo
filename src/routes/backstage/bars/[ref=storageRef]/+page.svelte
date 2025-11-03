<script lang="ts">
    import type { PageData, ActionData } from './$types';
    import { enhance } from '$app/forms';
    import { onMount } from 'svelte';
    import { computeCountsByVariant, computeTotalVolume } from '$lib/bar/barAggregation';
    import { stringifyStorageRef } from '$lib/bar/refs';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    const offerItemUsage = $derived.by(() => {
        return (data.stats?.offerItems || [])
            .map((offerItemStats) => {
                const variantCounts = computeCountsByVariant(offerItemStats.data.pricing, offerItemStats.orderItems);
                const totalVolume = computeTotalVolume(variantCounts)

                return {
                    ...offerItemStats,
                    key: offerItemStats.data.key,
                    variantCounts,
                    totalVolume,
                };
            })
    })

    onMount(() => {
        import("bootstrap/dist/js/bootstrap.bundle.min.js")
    });
</script>

<nav class="breadcrumbs">
	<a href="/backstage/bars">Bars</a> / {data.ref.key === 'new' ? 'New Bar' : data.bar?.name}
</nav>

<main class="backstage-content" data-page="bar.dashboard">
    <header class="page-header">
        <h1>{data.ref.key === 'new' ? 'Create New Bar' : data.bar?.name} Dashboard</h1>
        {#if data.ref.key !== 'new'}
            <div class="actions">
                <a
                    href={`/bar/${stringifyStorageRef(data.ref)}`}
                    target="_blank"
                >Kiosek</a>
            </div>
        {/if}
    </header>

    {#if data.ref.type === 'local'}
        <div class="card card-body info-message">
            <p><strong>This is a local (localStorage) bar.</strong></p>
            <p>Local bars cannot be edited through the backstage. They are managed locally in the browser.</p>
        </div>
    {:else if data.ref.key === 'new'}
        <div class="card card-body info-message">
            <p><strong>Create a new bar to access the dashboard.</strong></p>
        </div>
        <div class="card" style="max-width: 600px; margin-top: 2rem;">
            <form method="POST" action="?/save" use:enhance class="card-body flow-block">
                <div class="input-pair">
                    <label for="slug" class="form-label">Slug</label>
                    <input
                        type="text"
                        id="slug"
                        name="slug"
                        class="form-control"
                        value={form?.data?.slug ?? ''}
                        required
                        pattern="[a-z0-9\-]+"
                        placeholder="my-bar"
                        class:error={form?.errors?.slug}
                    />
                    {#if form?.errors?.slug}
                        <span class="error-message">{form.errors.slug}</span>
                    {/if}
                    <small>Lowercase letters, numbers, and hyphens only (2-40 characters)</small>
                </div>

                <div class="input-pair">
                    <label for="name" class="form-label">Name</label>
                    <input
                        type="text"
                        id="name"
                        name="name"
                        class="form-control"
                        value={form?.data?.name ?? ''}
                        required
                        placeholder="My Awesome Bar"
                        class:error={form?.errors?.name}
                    />
                    {#if form?.errors?.name}
                        <span class="error-message">{form.errors.name}</span>
                    {/if}
                    <small>Display name for your bar (minimum 2 characters)</small>
                </div>

                <div class="actions">
                    <button type="submit" class="btn btn-primary">Create Bar</button>
                </div>
            </form>
        </div>
    {:else}

        <div class="dashboard-grid row">
            <section class="col-md-8" data-name="bar-info">
                <div class="card">
                    <div class="card-header">
                        <h2>Bar Information</h2>
                        <div class="actions">
                            <div class="dropdown">
                                <button class="btn btn-sm btn-secondary dropdown-toggle"
                                    type="button"
                                    data-bs-toggle="dropdown"
                                    aria-expanded="false"
                                >Manage</button>
                                <ul class="dropdown-menu">
                                    <li><a class="dropdown-item" href="/backstage/bars/{data.ref.key}/offer">Offer Items</a></li>
                                    <li role="separator" class="dropdown-divider"></li>
                                    <li>
                                        <form method="POST" use:enhance>
                                            <button
                                                type="submit"
                                                formaction="?/delete"
                                                class="dropdown-item text-danger"
                                                disabled
                                                onclick={(e) => {
                                                    if (!confirm('Are you sure you want to delete this bar?')) {
                                                        e.preventDefault();
                                                    }
                                                }}
                                            >
                                                Delete Bar
                                            </button>
                                        </form>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    <form method="POST" action="?/save" use:enhance class="card-body flow-block">
                        <div class="input-pair">
                            <label for="slug" class="form-label">Slug</label>
                            <input
                                type="text"
                                id="slug"
                                name="slug"
                                class="form-control"
                                value={form?.data?.slug ?? data.bar?.slug ?? ''}
                                required
                                pattern="[a-z0-9\-]+"
                                placeholder="my-bar"
                                class:error={form?.errors?.slug}
                            />
                            {#if form?.errors?.slug}
                                <span class="error-message">{form.errors.slug}</span>
                            {/if}
                            <small>Lowercase letters, numbers, and hyphens only (2-40 characters)</small>
                        </div>

                        <div class="input-pair">
                            <label for="name" class="form-label">Name</label>
                            <input
                                type="text"
                                id="name"
                                name="name"
                                class="form-control"
                                value={form?.data?.name ?? data.bar?.name ?? ''}
                                required
                                placeholder="My Awesome Bar"
                                class:error={form?.errors?.name}
                            />
                            {#if form?.errors?.name}
                                <span class="error-message">{form.errors.name}</span>
                            {/if}
                            <small>Display name for your bar (minimum 2 characters)</small>
                        </div>

                        <div class="actions">
                            <button type="submit" class="btn btn-primary">Save Changes</button>
                        </div>

                        {#if form?.success && form?.action !== 'createEvent'}
                            <div class="alert alert-success">Bar saved successfully!</div>
                        {/if}
                    </form>
                </div>
            </section>

            <section class="col-md-4" data-name="member-stats">
                <div class="card">
                    <div class="card-header">
                        <h2>Members</h2>
                        <div class="actions">
                            <div class="dropdown">
                                <button class="btn btn-sm btn-secondary dropdown-toggle"
                                    type="button"
                                    data-bs-toggle="dropdown"
                                    aria-expanded="false"
                                    aria-label="Manage members"
                                ></button>
                                <ul class="dropdown-menu">
                                    <li><a class="dropdown-item" href="/backstage/bars/{data.ref.key}/mapper">Member Mapping</a></li>
                                    <li><a class="dropdown-item" href="/backstage/bars/{data.ref.key}/summaries">Member Summaries</a></li>
                                </ul>
                            </div>
                        </div>
                    </div>
                    <div class="card-body">
                        <p>Most orders</p>
                        <ol class="ranking">
                            {#each data.stats?.memberStats.slice(0, 10) as stat (stat.member.id)}
                                <li>
                                    <span class="name">{stat.member.nickName}</span>
                                    <span class="score">{stat.orderCount}</span>
                                </li>
                            {/each}
                        </ol>
                    </div>
                </div>
            </section>

            <!-- Offer Items Section -->
            <section class="offer-items-section">
                <header>
                    <h2>Offer Items & Keg Usage</h2>
                </header>

                {#if data.stats?.offerItems && data.stats.offerItems.length > 0}
                    <div class="items-grid">
                        {#each offerItemUsage as offerItem (offerItem.data.key)}
                            <div class="card">
                                <header class="card-header">
                                    <h3>{offerItem.data.name}</h3>
                                </header>

                                <div class="card-body flow-block offer-item-body">
                                    <div class="alert alert-info alert-sm last-uncork-info">
                                        <div class="row">
                                            <div class="col">
                                                <strong>Last uncorked:</strong>
                                                {#if offerItem.lastKegUncork}
                                                <time>{offerItem.lastKegUncork.toLocaleString()}</time>
                                                {:else}
                                                    <em>Never</em>
                                                {/if}
                                            </div>
                                            <div class="col-auto">
                                                <form method="POST" action="?/createEvent" use:enhance>
                                                    <input type="hidden" name="eventType" value="keg-uncork" />
                                                    <input type="hidden" name="offerItemKey" value={offerItem.data.key} />
                                                    <button type="submit" class="btn btn-outline-primary btn-sm">
                                                        Uncork
                                                    </button>
                                                </form>
                                            </div>
                                        </div>

                                    </div>
                                    <div class="items-grid -tight">
                                        {#each Object.entries(offerItem.variantCounts) as [variant, count]}
                                            <div class="tile">
                                                <span class="label">{`${variant}`}</span>
                                                <span role="separator">×</span>

                                                <span class="value">{count}</span>
                                            </div>
                                        {/each}
                                    </div>
                                    <div class="alert alert-success">
                                        <strong>Total Volume:</strong> {offerItem.totalVolume.toFixed(1)}L
                                    </div>
                                </div>
                            </div>
                        {/each}
                    </div>
                {:else}
                    <div class="empty-state">
                        <p>No offer items yet. <a href="/backstage/bars/{data.ref.key}/offer">Add some items</a> to get started.</p>
                    </div>
                {/if}
            </section>
        </div>
    {/if}
</main>

<style lang="scss">

.offer-item-body {
    --item-size: 120px;

    .alert {
        margin-block-end: 0;
    }

    .last-uncork-info {
        padding: 0.75rem;
        background: #e8f4f8;
        border-radius: 4px;
        font-size: 0.9rem;

        strong {
            display: block;
            margin-bottom: 0.25rem;
            color: #0066cc;
        }

        time {
            color: #495057;
        }
    }
}

</style>
