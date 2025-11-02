<script lang="ts">
    import type { PageData, ActionData } from './$types';
    import { enhance } from '$app/forms';
    import { stringifyStorageRef } from '$lib/bar/refs';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    let editingItem = $state<any>(null);
    let showCreateForm = $state(false);

    function startEdit(item) {
        editingItem = { ...item, pricing: JSON.stringify(item.pricing || {}, null, 2) };
        showCreateForm = false;
    }

    function cancelEdit() {
        editingItem = null;
        showCreateForm = false;
    }

    function startCreate() {
        showCreateForm = true;
        editingItem = null;
    }
</script>

<nav class="breadcrumbs">
    <a href="/backstage/bars">Bars</a> /
    <a href="/backstage/bars/{stringifyStorageRef(data.ref)}">{data.bar.name}</a> /
    <span>Items</span>
</nav>

<main class="backstage-content items-page">

    <header class="page-header">
        <div>
            <h2>Manage bar items</h2>
        </div>
    </header>

    {#if data.ref.type === 'local'}
        <div class="card card-body info-message">
            <p><strong>This is a local (localStorage) bar.</strong></p>
            <p>Items for local bars cannot be managed through the backstage. They are managed locally in the browser.</p>
        </div>
    {:else}
        <div class="content-layout">
            <section class="card">
                <header class="card-header">
                    <h3>Offer Items</h3>
                    <div class="actions">
                        <button type="button" class="btn btn-primary" onclick={startCreate}>Add Item</button>
                    </div>
                </header>

                {#if data.items.length === 0}
                    <div class="empty-state">
                        <p>No items yet. Add your first offer item.</p>
                    </div>
                {:else}

                <table class="table">
                    <thead>
                        <tr>
                            <th>Key</th>
                            <th>Name</th>
                            <th>Pricing</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each data.items as item}
                            <tr>
                                <td><code>{item.key}</code></td>
                                <td>{item.name}</td>
                                <td>
                                    <div class="pricing-display">
                                        {#if item.pricing && Object.keys(item.pricing).length > 0}
                                            {#each Object.entries(item.pricing) as [variant, price]}
                                                <span class="price-tag">{variant}: {price}</span>
                                            {/each}
                                        {:else}
                                            <span class="text-muted">No pricing</span>
                                        {/if}
                                    </div>
                                </td>
                                <td>
                                    <div class="actions">
                                        <button type="button" class="btn btn-link" onclick={() => startEdit(item)}>
                                            Edit
                                        </button>
                                        <form method="POST" action="?/delete" use:enhance>
                                            <input type="hidden" name="itemId" value={item.id} />
                                            <button
                                                type="submit"
                                                class="btn btn-link text-danger"
                                                onclick={(e) => {
                                                    if (!confirm('Delete this item?')) {
                                                        e.preventDefault();
                                                    }
                                                }}
                                            >
                                                Delete
                                            </button>
                                        </form>
                                    </div>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>

            {/if}
            </section>

            {#if showCreateForm || editingItem}
                <aside class="card">
                <div class="card-body">
                    <h3>{editingItem ? 'Edit Item' : 'Create Item'}</h3>
                    <form
                        method="POST"
                        action={editingItem ? '?/update' : '?/create'}
                        use:enhance={() => {
                            return async ({ update, result }) => {
                                await update();
                                if (result.type === 'success') {
                                    cancelEdit();
                                }
                            };
                        }}
                        class="row g-3"
                    >
                        {#if editingItem}
                            <input type="hidden" name="itemId" value={editingItem.id} />
                        {/if}
                        <div class="input-pair col-md-5">
                            <label for="key" class="form-label">Key</label>
                            <input
                                type="text"
                                id="key"
                                name="key"
                                class="form-control"
                                value={form?.data?.key ?? editingItem?.key ?? ''}
                                required
                                pattern="[a-z0-9\-]+"
                                placeholder="beer-500"
                                class:error={form?.errors?.key}
                            />
                            {#if form?.errors?.key}
                                <span class="error-message">{form.errors.key}</span>
                            {/if}
                            <small>3-10 characters, lowercase, numbers, hyphens</small>
                        </div>
                        <div class="input-pair col-md-7">
                            <label for="name" class="form-label">Name</label>
                            <input
                                type="text"
                                id="name"
                                name="name"
                                class="form-control"
                                value={form?.data?.name ?? editingItem?.name ?? ''}
                                required
                                placeholder="Beer 500ml"
                                class:error={form?.errors?.name}
                            />
                            {#if form?.errors?.name}
                                <span class="error-message">{form.errors.name}</span>
                            {/if}
                        </div>
                        <div class="input-pair col-12">
                            <label for="pricing" class="form-label">Pricing (JSON)</label>
                            <textarea
                                id="pricing"
                                name="pricing"
                                rows="6"
                                placeholder='&#123;"x": 50, "1": 100&#125;'
                                class="form-control"
                                class:error={form?.errors?.pricing}
                            >{form?.data?.pricing ?? editingItem?.pricing ?? '{}'}</textarea>
                            {#if form?.errors?.pricing}
                                <span class="error-message">{form.errors.pricing}</span>
                            {/if}
                            <small>JSON object with variant keys and numeric prices</small>
                        </div>
                        <div class="col-12 actions">
                            <button type="submit" class="btn btn-primary">
                                {editingItem ? 'Update' : 'Create'}
                            </button>
                            <button type="button" class="btn btn-secondary" onclick={cancelEdit}>
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            </aside>
            {/if}
        </div>
    {/if}
</main>
