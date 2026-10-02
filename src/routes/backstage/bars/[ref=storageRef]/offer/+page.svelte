<script lang="ts">
    import * as m from '$lib/paraglide/messages.js';
    import type { PageData, ActionData } from './$types';
    import type { BarOfferItem } from '$lib/bar/BarModel';
    import { enhance } from '$app/forms';
    import FileDrop from '$lib/components/FileDrop.svelte';
    import { formatBytes } from '$lib/bar/quantity';
    import {
        SERVING_PRESETS,
        DEFAULT_SERVING_PRESET,
        servingLabel,
        servingPreset,
        servingsOf,
        servingText,
        type ServingPresetKey,
    } from '$lib/bar/servings';
    import { PICTURE_MAX_BYTES } from './offerItem';
    import { getRenderer } from '$lib/rendering.svelte';
    import { getUiLayers, type UiLayerCtrl } from '$lib/ui/uiLayers.svelte';

    const renderer = getRenderer()
    const uiLayers = getUiLayers()

    let { data, form }: { data: PageData; form: ActionData } = $props();

    let preset = $state<ServingPresetKey>(DEFAULT_SERVING_PRESET);
    let picture = $state<File | null>(null);

    const presetMeasure = $derived(servingPreset({ servingPreset: preset }).measure);

    let formLayerCtrl = $state<UiLayerCtrl | null>(null);
    function openItemForm(item: BarOfferItem | null) {
        if (formLayerCtrl) return;

        picture = null;
        preset = item?.servingPreset ?? DEFAULT_SERVING_PRESET;

        formLayerCtrl = uiLayers.pushSnippet(offerItemForm, item, {
            heading: item
                ? m["baroo.backstage.offer.edit_item"]()
                : m["baroo.backstage.offer.create_item"](),
            onDestroyed: () => {
                formLayerCtrl = null;
                picture = null;
                preset = DEFAULT_SERVING_PRESET;
            },
        }).ctrl;
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
                        <button type="button" class="btn btn-outline-primary" onclick={() => openItemForm(null)}>{m["baroo.backstage.offer.add_item"]()}</button>
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
                            <th class="picture-col">{m["baroo.backstage.offer.picture"]()}</th>
                            <th>{m["baroo.backstage.offer.key"]()}</th>
                            <th>{m["baroo.backstage.offer.name"]()}</th>
                            <th>{m["baroo.backstage.offer.pricing"]()}</th>
                            <th>{m["baroo.backstage.offer.actions"]()}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each data.items as item}
                            <tr>
                                <td class="picture-col">
                                    {#if item.preview_1x1}
                                        <img
                                            class="thumb"
                                            src="/storage/api/files/bar_offer_items/{item.id}/{item.preview_1x1}"
                                            alt=""
                                        />
                                    {/if}
                                </td>
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
                                        <button type="button" class="btn btn-link" onclick={() => openItemForm(item)}>
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
        </div>
</main>

{#snippet offerItemForm(item: BarOfferItem | null)}
    <form
        method="POST"
        action={item ? '?/update' : '?/create'}
        enctype="multipart/form-data"
        use:enhance={({ formData }) => {
            // The drop zone holds the file in state rather than in an
            // input, so this is where it joins the rest of the fields.
            if (picture) formData.set('preview_1x1', picture);

            return async ({ update, result }) => {
                await update();
                if (result.type === 'success') {
                    formLayerCtrl?.close();
                }
            };
        }}
        class="row g-3"
    >
        {#if item}
            <input type="hidden" name="itemId" value={item.id} />
        {/if}
        <div class="input-pair col-md-5">
            <label for="key" class="form-label">{m["baroo.backstage.offer.key"]()}</label>
            <input
                type="text"
                id="key"
                name="key"
                class="form-control"
                value={form?.data?.key ?? item?.key ?? ''}
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
                value={form?.data?.name ?? item?.name ?? ''}
                required
                placeholder={m["baroo.backstage.offer.placeholder_name"]()}
                class:error={form?.errors?.name}
            />
            {#if form?.errors?.name}
                <span class="error-message">{form.errors.name}</span>
            {/if}
        </div>
        <div class="input-pair col-12">
            <span class="form-label">{m["baroo.backstage.offer.picture"]()}</span>
            <FileDrop
                accept="image/*"
                maxBytes={PICTURE_MAX_BYTES}
                aspectRatio={1}
                aspectLabel="1:1"
                hint={m["baroo.backstage.offer.picture_hint"]({ max: formatBytes(PICTURE_MAX_BYTES) })}
                currentSrc={item?.preview_1x1
                    ? `/storage/api/files/bar_offer_items/${item.id}/${item.preview_1x1}`
                    : null}
                onselect={(file) => (picture = file)}
            />
            {#if picture}
                <small>{m["baroo.backstage.offer.picture_pending"]()}</small>
            {/if}
            {#if form?.errors?.preview_1x1}
                <span class="error-message">{form.errors.preview_1x1}</span>
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
                {#each Object.values(SERVING_PRESETS) as preset (preset.key)}
                    <option value={preset.key}>{renderer.print(preset.label)}</option>
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
                            value={item?.pricing?.[serving.key]}
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
                {item ? m["baroo.backstage.offer.update"]() : m["baroo.backstage.offer.create"]()}
            </button>
            <button type="button" class="btn btn-secondary" onclick={() => formLayerCtrl?.close()}>
                {m["baroo.backstage.offer.cancel"]()}
            </button>
        </div>
    </form>
{/snippet}

<style lang="scss">
.picture-col {
    width: 1%;
    white-space: nowrap;
}

.thumb {
    width: 2.5rem;
    height: 2.5rem;
    object-fit: contain;
    border-radius: 0.25rem;
    background: #fff;
}

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
