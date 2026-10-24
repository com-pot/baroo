<script lang="ts">
    import * as m from '$lib/paraglide/messages.js';
    import type { PageData, ActionData } from './$types';
    import type { BarOfferItem } from '$lib/bar/BarModel';
    import { enhance } from '$app/forms';
    import FileDrop from '$lib/components/FileDrop.svelte';
    import {
        SERVING_PRESETS,
        servingLabel,
        servingPreset,
        servingText,
        type ServingPreset,
    } from '$lib/bar/servings';
    import { PICTURE_MAX_BYTES } from './offerItem';
    import { getRenderer } from '$lib/rendering.svelte';
    import { getUiLayers, type UiLayerCtrl } from '$lib/ui/uiLayers.svelte';
    import FormErrors from '$lib/components/FormErrors.svelte';
    import { entityFileHref } from '$lib/ui/pbFiles';

    const renderer = getRenderer()
    const uiLayers = getUiLayers()

    let { data, form }: { data: PageData; form: ActionData } = $props();

    let preset = $state<ServingPreset["key"]>(SERVING_PRESETS.items[0].key);

    const activePreset = $derived(servingPreset(preset));

    let formLayerCtrl = $state<UiLayerCtrl | null>(null);
    function openItemForm(item: BarOfferItem | null) {
        if (formLayerCtrl) return;

        preset = item?.servingPreset ?? SERVING_PRESETS.items[0].key;

        formLayerCtrl = uiLayers.pushSnippet(offerItemForm, item, {
            heading: item
                ? m["baroo.backstage.offer.edit_item"]()
                : m["baroo.backstage.offer.create_item"](),
            onDestroyed: () => {
                formLayerCtrl = null;
                preset = SERVING_PRESETS.items[0].key;
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
                        <button type="button" class="btn btn-outline-primary" onclick={() => openItemForm(null)}>{m["baroo.backstage.offer.add_item"]()}</button>
                    </div>
                </header>

                {#if data.items.length === 0}
                    <div class="card empty-state">
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
                                    <div class="frame thumb">
                                        {#if item.preview_1x1}
                                            <img
                                                src={entityFileHref('bar_offer_items', item.id, item.preview_1x1)}
                                                alt=""
                                            />
                                        {:else}
                                            <div class="placeholder" role="img"></div>
                                        {/if}
                                    </div>
                                </td>
                                <td>
                                    <code>{item.key}</code>
                                    {#if item.tagSerial}
                                        <small class="tag-serial" title={m["baroo.backstage.offer.tag_serial"]()}>📶 {item.tagSerial}</small>
                                    {/if}
                                </td>
                                <td>{item.name}</td>
                                <td>
                                    <div class="pricing-display">
                                        {#if item.pricing && Object.keys(item.pricing).length > 0}
                                            {#each Object.entries(item.pricing) as [variant, price]}
                                                <span class="badge bg-info">{servingLabel(item.servingPreset, variant)}: {renderer.formatCurrency("czk", price)}</span>
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
        use:enhance={() => {
            return async ({ update, result }) => {
                console.log(result)
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
            <FormErrors error={form?.errors?.key}/>
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
            <FormErrors error={form?.errors?.name}/>
        </div>
        <div class="input-pair col-12">
            <span class="form-label">{m["baroo.backstage.offer.picture"]()}</span>
            <FileDrop
                name="preview_1x1"
                accept="image/*"
                maxBytes={PICTURE_MAX_BYTES}
                aspectRatio={1}
                aspectLabel="1:1"
                hint={m["baroo.backstage.offer.picture_hint"]({ max: renderer.formatBytes(PICTURE_MAX_BYTES) })}
                currentSrc={item?.preview_1x1 ? entityFileHref('bar_offer_items', item.id, item.preview_1x1) : null}
            />
            <FormErrors error={form?.errors?.preview_1x1}/>
        </div>
        <div class="input-pair col-md-5">
            <label for="servingPreset" class="form-label">{m["baroo.backstage.offer.serving_preset"]()}</label>
            <select
                id="servingPreset"
                name="servingPreset"
                class="form-select"
                bind:value={preset}
            >
                {#each SERVING_PRESETS.items as preset (preset.key)}
                    <option value={preset.key}>{renderer.print(preset.label)}</option>
                {/each}
            </select>
        </div>
        <div class="col-12">
            <span class="form-label">{m["baroo.backstage.offer.serving_prices"]()}</span>
            <div class="serving-prices">
                {#each activePreset.servings as serving (serving.key)}
                    {@const priceId = `pricing.${serving.key}`}
                    <label for={priceId}>{servingText(serving, activePreset.measure)}</label>
                    <div class="input-group">
                        <input
                            type="number"
                            id={priceId}
                            name={priceId}
                            class="form-control"
                            placeholder={m["baroo.backstage.offer.variant_price_placeholder"]()}
                            value={item?.pricing?.[serving.key]}
                            step="0.01"
                            min="0"
                        />
                        <span class="input-group-text">{renderer.currencySymbol("czk")}</span>
                    </div>
                {/each}
            </div>
            <FormErrors error={form?.errors?.pricing}/>
            <FormErrors error={form?.errors?.servingPreset}/>
        </div>
        <div class="input-pair col-md-7">
            <label for="tagSerial" class="form-label">{m["baroo.backstage.offer.tag_serial"]()}</label>
            <input
                type="text"
                id="tagSerial"
                name="tagSerial"
                class="form-control font-monospace"
                value={form?.data?.tagSerial ?? item?.tagSerial ?? ''}
                autocomplete="off"
                spellcheck="false"
                placeholder={m["baroo.backstage.offer.tag_serial_placeholder"]()}
                class:error={form?.errors?.tagSerial}
            />
            <FormErrors error={form?.errors?.tagSerial}/>
            <small>{m["baroo.backstage.offer.tag_serial_help"]()}</small>
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

.frame.thumb {
    width: 2.5rem;
    height: 2.5rem;
    object-fit: contain;
    border-radius: 0.25rem;
    overflow: clip;
}

.tag-serial {
    display: block;
    color: #6b7280;
    font-family: monospace;
}

.serving-prices {
    display: grid;
    grid-template-columns: 1fr 160px;
    gap: 0.5rem;
    align-items: center;
}
</style>
