<script lang="ts">
    import * as m from '$lib/paraglide/messages.js';
    import type { PageData, ActionData } from './$types';
    import { enhance } from '$app/forms';
    import { stringifyStorageRef } from '$lib/bar/refs';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    let editingItem = $state<any>(null);
    let showCreateForm = $state(false);
    let pricingVariants = $state<Array<{ name: string; price: string; volume: string }>>([]);

    function startEdit(item) {
        editingItem = { ...item };
        // Convert pricing object to array of variants
        pricingVariants = Object.entries(item.pricing || {}).map(([name, price]) => ({
            name,
            price: String(price),
            volume: String(item.variantVolumes?.[name] || '')
        }));
        if (pricingVariants.length === 0) {
            pricingVariants = [{ name: '', price: '', volume: '' }];
        }
        showCreateForm = false;
    }

    function cancelEdit() {
        editingItem = null;
        showCreateForm = false;
        pricingVariants = [];
    }

    function startCreate() {
        showCreateForm = true;
        editingItem = null;
        pricingVariants = [{ name: '', price: '', volume: '' }];
    }

    function addVariant() {
        pricingVariants = [...pricingVariants, { name: '', price: '', volume: '' }];
    }

    function removeVariant(index: number) {
        pricingVariants = pricingVariants.filter((_, i) => i !== index);
        if (pricingVariants.length === 0) {
            pricingVariants = [{ name: '', price: '', volume: '' }];
        }
    }
</script>

<nav class="breadcrumbs">
    <a href="/backstage/bars">{m["baroo.backstage.bars.breadcrumb"]()}</a> /
    <a href="/backstage/bars/{stringifyStorageRef(data.ref)}">{data.bar.name}</a> /
    <span>{m["baroo.backstage.offer.breadcrumb"]()}</span>
</nav>

<main class="backstage-content items-page">

    <header class="page-header">
        <div>
            <h2>{m["baroo.backstage.offer.title"]()}</h2>
        </div>
    </header>

    {#if data.ref.type === 'local'}
        <div class="card card-body info-message">
            <p><strong>{m["baroo.backstage.offer.local_info"]()}</strong></p>
            <p>{m["baroo.backstage.offer.local_info_details"]()}</p>
        </div>
    {:else}
        <div class="content-layout">
            <section class="card">
                <header class="card-header">
                    <h3>{m["baroo.backstage.offer.offer_items"]()}</h3>
                    <div class="actions">
                        <button type="button" class="btn btn-primary" onclick={startCreate}>{m["baroo.backstage.offer.add_item"]()}</button>
                    </div>
                </header>

                {#if data.items.length === 0}
                    <div class="empty-state">
                        <p>{m["baroo.backstage.offer.no_items"]()}</p>
                    </div>
                {:else}

                <table class="table">
                    <thead>
                        <tr>
                            <th>{m["baroo.backstage.offer.key"]()}</th>
                            <th>{m["baroo.backstage.offer.name"]()}</th>
                            <th>{m["baroo.backstage.offer.pricing"]()}</th>
                            <th>{m["baroo.backstage.offer.actions"]()}</th>
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
                                                {@const displayLabel = item.variantLabels?.[variant] || variant}
                                                <span class="price-tag">{displayLabel}: {price}</span>
                                            {/each}
                                        {:else}
                                            <span class="text-muted">{m["baroo.backstage.offer.no_pricing"]()}</span>
                                        {/if}
                                    </div>
                                </td>
                                <td>
                                    <div class="actions">
                                        <button type="button" class="btn btn-link" onclick={() => startEdit(item)}>
                                            {m["baroo.backstage.offer.edit"]()}
                                        </button>
                                        <form method="POST" action="?/delete" use:enhance>
                                            <input type="hidden" name="itemId" value={item.id} />
                                            <button
                                                type="submit"
                                                class="btn btn-link text-danger"
                                                onclick={(e) => {
                                                    if (!confirm(m["baroo.backstage.offer.delete_confirm"]())) {
                                                        e.preventDefault();
                                                    }
                                                }}
                                            >
                                                {m["baroo.backstage.offer.delete"]()}
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
                    <h3>{editingItem ? m["baroo.backstage.offer.edit_item"]() : m["baroo.backstage.offer.create_item"]()}</h3>
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
                            <label for="key" class="form-label">{m["baroo.backstage.offer.key"]()}</label>
                            <input
                                type="text"
                                id="key"
                                name="key"
                                class="form-control"
                                value={form?.data?.key ?? editingItem?.key ?? ''}
                                required
                                pattern="[a-z0-9\-]+"
                                placeholder={m["baroo.backstage.offer.placeholder_key"]()}
                                class:error={form?.errors?.key}
                            />
                            {#if form?.errors?.key}
                                <span class="error-message">{form.errors.key}</span>
                            {/if}
                            <small>{m["baroo.backstage.offer.key_help"]()}</small>
                        </div>
                        <div class="input-pair col-md-7">
                            <label for="name" class="form-label">{m["baroo.backstage.offer.name"]()}</label>
                            <input
                                type="text"
                                id="name"
                                name="name"
                                class="form-control"
                                value={form?.data?.name ?? editingItem?.name ?? ''}
                                required
                                placeholder={m["baroo.backstage.offer.placeholder_name"]()}
                                class:error={form?.errors?.name}
                            />
                            {#if form?.errors?.name}
                                <span class="error-message">{form.errors.name}</span>
                            {/if}
                        </div>
                        <div class="input-pair col-12">
                            <label class="form-label">{m["baroo.backstage.offer.pricing_variants"]()}</label>
                            <div class="pricing-variants">
                                {#each pricingVariants as variant, index}
                                    <div class="variant-row">
                                        <input
                                            type="text"
                                            name="variant_name_{index}"
                                            class="form-control"
                                            placeholder={m["baroo.backstage.offer.variant_name_placeholder"]()}
                                            bind:value={variant.name}
                                        />
                                        <input
                                            type="number"
                                            name="variant_price_{index}"
                                            class="form-control"
                                            placeholder={m["baroo.backstage.offer.variant_price_placeholder"]()}
                                            bind:value={variant.price}
                                            step="0.01"
                                        />
                                        <input
                                            type="number"
                                            name="variant_volume_{index}"
                                            class="form-control"
                                            placeholder="ML"
                                            bind:value={variant.volume}
                                            step="1"
                                            min="0"
                                        />
                                        <button
                                            type="button"
                                            class="btn btn-sm btn-danger"
                                            onclick={() => removeVariant(index)}
                                            disabled={pricingVariants.length === 1}
                                        >
                                            {m["baroo.backstage.offer.remove_variant"]()}
                                        </button>
                                    </div>
                                {/each}
                                <button type="button" class="btn btn-sm btn-secondary" onclick={addVariant}>
                                    {m["baroo.backstage.offer.add_variant"]()}
                                </button>
                            </div>
                            {#if form?.errors?.pricing}
                                <span class="error-message">{form.errors.pricing}</span>
                            {/if}
                        </div>
                        <div class="col-12 actions">
                            <button type="submit" class="btn btn-primary">
                                {editingItem ? m["baroo.backstage.offer.update"]() : m["baroo.backstage.offer.create"]()}
                            </button>
                            <button type="button" class="btn btn-secondary" onclick={cancelEdit}>
                                {m["baroo.backstage.offer.cancel"]()}
                            </button>
                        </div>
                    </form>
                </div>
            </aside>
            {/if}
        </div>
    {/if}
</main>

<style lang="scss">
.pricing-variants {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;

    .variant-row {
        display: grid;
        grid-template-columns: 1fr 1fr 100px auto;
        gap: 0.5rem;
        align-items: center;
    }
}
</style>
