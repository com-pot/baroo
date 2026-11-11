<script lang="ts">
    import * as m from '$lib/paraglide/messages.js';
    import type { PageData, ActionData } from './$types';
    import type { BarOfferItem } from '$lib/bar/BarModel';
    import { enhance } from '$app/forms';
    import FileDrop from '$lib/components/FileDrop.svelte';
    import {
        SERVING_PRESETS,
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

    let packageLayerCtrl = $state<UiLayerCtrl | null>(null);
    function openPackageForm(item: BarOfferItem) {
        if (packageLayerCtrl) return;

        packageLayerCtrl = uiLayers.pushSnippet(offerPackageForm, item, {
            heading: `${m["baroo.backstage.offer.add_package"]()} — ${item.name}`,
            onDestroyed: () => {
                packageLayerCtrl = null;
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
                            <th>{m["baroo.backstage.offer.name"]()}</th>
                            <th>{m["baroo.backstage.offer.pricing"]()}</th>
                            <th>{m["baroo.backstage.offer.packages"]()}</th>
                            <th>{m["baroo.backstage.offer.actions"]()}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each data.items as item}
                            {@const counts = data.packageCounts[item.id]}
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
                                    <div>{item.name}</div>
                                    <code>{item.key}</code>
                                </td>
                                <td>
                                    <div class="pricing-display">
                                        {#if item.pricing && Object.keys(item.pricing).length > 0}
                                            {#each item.servings as serving (serving.key)}
                                                <span class="badge bg-info">{servingText(serving, item.measure)}: {renderer.formatCurrency("czk", item.pricing[serving.key])}</span>
                                            {/each}
                                        {:else}
                                            <span class="text-muted">{m["baroo.backstage.offer.no_pricing"]()}</span>
                                        {/if}
                                    </div>
                                </td>
                                <td>
                                    <div class="package-counts">
                                        <span title={m["baroo.backstage.offer.packages_registered"]()}>{counts?.registered ?? 0}</span>
                                        <span class="text-primary" title={m["baroo.backstage.offer.packages_unsealed"]()}>{counts?.unsealed ?? 0}</span>
                                        <span class="text-muted" title={m["baroo.backstage.offer.packages_flushed"]()}>{counts?.flushed ?? 0}</span>
                                        <button
                                            type="button"
                                            class="btn btn-icon btn-sm"
                                            title={m["baroo.backstage.offer.add_package"]()}
                                            aria-label={m["baroo.backstage.offer.add_package"]()}
                                            onclick={() => openPackageForm(item)}
                                        >➕</button>
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
    {@const failed = form?.data && 'key' in form.data ? form.data : null}
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
                value={failed?.key ?? item?.key ?? ''}
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
                value={failed?.name ?? item?.name ?? ''}
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

{#snippet offerPackageForm(item: BarOfferItem)}
    {@const failed = form?.action === 'createPackage' ? form : null}
    {@const failedData = failed?.data && 'offerItem' in failed.data ? failed.data : null}
    <form
        method="POST"
        action="?/createPackage"
        use:enhance={() => {
            return async ({ update, result }) => {
                await update();
                if (result.type === 'success') {
                    packageLayerCtrl?.close();
                }
            };
        }}
        class="row g-3"
    >
        <input type="hidden" name="offerItem" value={item.id} />
        <p class="col-12 text-meta">{m["baroo.backstage.offer.packages_info"]()}</p>
        <div class="input-pair col-md-6">
            <label for="package.label" class="form-label">{m["baroo.backstage.offer.package_label"]()}</label>
            <input
                type="text"
                id="package.label"
                name="label"
                class="form-control"
                maxlength="40"
                value={failedData?.label ?? ''}
                placeholder={m["baroo.backstage.offer.package_label_placeholder"]()}
            />
            <FormErrors error={failed?.errors?.label}/>
        </div>
        <div class="input-pair col-md-6">
            <label for="package.quantity" class="form-label">{m["baroo.backstage.offer.package_quantity"]()}</label>
            <input
                type="number"
                id="package.quantity"
                name="quantity"
                class="form-control"
                min="0"
                step="0.1"
                required
                value={failedData?.quantity ?? ''}
            />
            <FormErrors error={failed?.errors?.quantity}/>
            <small>{m["baroo.backstage.offer.package_quantity_help"]()}</small>
        </div>
        <div class="input-pair col-12">
            <label for="package.tagSerial" class="form-label">{m["baroo.backstage.offer.tagSerial"]()}</label>
            <input
                type="text"
                id="package.tagSerial"
                name="tagSerial"
                class="form-control font-monospace"
                value={failedData?.tagSerial ?? ''}
                autocomplete="off"
                spellcheck="false"
                placeholder={m["baroo.backstage.offer.tag_serial_placeholder"]()}
            />
            <FormErrors error={failed?.errors?.tagSerial}/>
            <FormErrors error={failed?.errors?.offerItem}/>
            <small>{m["baroo.backstage.offer.tag_serial_help"]()}</small>
        </div>
        <div class="col-12 actions">
            <button type="submit" class="btn btn-primary">
                {m["baroo.backstage.offer.create"]()}
            </button>
            <button type="button" class="btn btn-secondary" onclick={() => packageLayerCtrl?.close()}>
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

.package-counts {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-variant-numeric: tabular-nums;
}

.content-layout {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
}

.serving-prices {
    display: grid;
    grid-template-columns: 1fr 160px;
    gap: 0.5rem;
    align-items: center;
}
</style>
