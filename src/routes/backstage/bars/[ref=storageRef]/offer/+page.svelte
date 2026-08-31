<script lang="ts">
    import * as m from '$lib/paraglide/messages.js';
    import type { PageData, ActionData } from './$types';
    import type { BarOfferItem } from '$lib/bar/BarModel';
    import { enhance } from '$app/forms';
    import Drawer from '$lib/components/Drawer.svelte';
    import {
        SERVING_PRESET_KEYS,
        DEFAULT_SERVING_PRESET,
        servingLabel,
        servingPreset,
        servingsOf,
        servingText,
        type ServingPresetKey,
    } from '$lib/bar/servings';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    let editingItem = $state<BarOfferItem | null>(null);
    let showCreateForm = $state(false);
    let preset = $state<ServingPresetKey>(DEFAULT_SERVING_PRESET);
    /** Price inputs keyed by serving key. Keys the current preset doesn't offer are never submitted. */
    let prices = $state<Record<string, string>>({});

    /** Decides whether a serving reads "0.3" or "1×". */
    const presetMeasure = $derived(servingPreset({ servingPreset: preset }).measure);

    const presetLabels: Record<ServingPresetKey, () => string> = {
        tap: m["baroo.backstage.offer.preset_tap"],
        unit: m["baroo.backstage.offer.preset_unit"],
    };

    function startEdit(item: BarOfferItem) {
        editingItem = { ...item };
        preset = item.servingPreset ?? DEFAULT_SERVING_PRESET;
        prices = Object.fromEntries(
            Object.entries(item.pricing || {}).map(([key, price]) => [key, String(price)]),
        );
        showCreateForm = false;
    }

    function cancelEdit() {
        editingItem = null;
        showCreateForm = false;
        preset = DEFAULT_SERVING_PRESET;
        prices = {};
    }

    function startCreate() {
        showCreateForm = true;
        editingItem = null;
        preset = DEFAULT_SERVING_PRESET;
        prices = {};
    }
</script>

<main class="backstage-content items-page">

    <header class="page-header">
        <div>
            <h2>{m["baroo.backstage.offer.title"]()}</h2>
        </div>
    </header>

        <div class="content-layout">
            <section class="card">
                <header class="card-header">
                    <h3>{m["baroo.backstage.offer.offer_items"]()}</h3>
                    <div class="actions">
                        <a class="btn btn-outline-secondary" href="/backstage/bars/{data.ref}/offer/price-list">{m["baroo.backstage.offer.price_list_link"]()}</a>
                        <button type="button" class="btn btn-outline-primary" onclick={startCreate}>{m["baroo.backstage.offer.add_item"]()}</button>
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
                                                <span class="price-tag">{servingLabel(item, variant)}: {price}</span>
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
            <Drawer>
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
                        <div class="input-pair col-md-5">
                            <label for="servingPreset" class="form-label">{m["baroo.backstage.offer.serving_preset"]()}</label>
                            <select
                                id="servingPreset"
                                name="servingPreset"
                                class="form-select"
                                bind:value={preset}
                            >
                                {#each SERVING_PRESET_KEYS as presetKey (presetKey)}
                                    <option value={presetKey}>{presetLabels[presetKey]()}</option>
                                {/each}
                            </select>
                        </div>
                        <div class="col-12">
                            <label class="form-label">{m["baroo.backstage.offer.serving_prices"]()}</label>
                            <div class="serving-prices">
                                {#each servingsOf({ servingPreset: preset }) as serving (serving.key)}
                                    <label class="serving-label" for="price_{serving.key}">{servingText(serving, presetMeasure)}</label>
                                    <div class="input-group">
                                        <input
                                            type="number"
                                            id="price_{serving.key}"
                                            name="price_{serving.key}"
                                            class="form-control"
                                            placeholder={m["baroo.backstage.offer.variant_price_placeholder"]()}
                                            bind:value={prices[serving.key]}
                                            step="0.01"
                                            min="0"
                                        />
                                        <span class="input-group-text">Kč</span>
                                    </div>
                                {/each}
                            </div>
                            {#if form?.errors?.pricing}
                                <span class="error-message">{form.errors.pricing}</span>
                            {/if}
                            {#if form?.errors?.servingPreset}
                                <span class="error-message">{form.errors.servingPreset}</span>
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
            </Drawer>
            {/if}
        </div>
</main>

<style lang="scss">
.serving-prices {
    display: grid;
    grid-template-columns: 1fr 160px;
    gap: 0.5rem;
    align-items: center;

    .serving-label {
        font-weight: 500;
        margin: 0;
    }
}
</style>
