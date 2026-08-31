<script lang="ts">
    import * as m from '$lib/paraglide/messages.js';
    import type { PageData, ActionData } from './$types';
    import { enhance } from '$app/forms';
    import { onMount } from 'svelte';
    import Drawer from "$lib/components/Drawer.svelte"
    import { computeCountsByVariant, computeTotalQuantity } from '$lib/bar/barAggregation';
    import { servingLabel, servingPreset } from '$lib/bar/servings';
    import { formatQuantity, measureLabel } from '$lib/bar/quantity';
    import { quantityLeft } from '$lib/bar/stats/barOfferItems';
    import ClosureDetails from './ClosureDetails.svelte';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    let openDrawer: { offerItemKey: string; closureIndex: number } | null = $state(null);

    const offerItemUsage = $derived.by(() => {
        return (data.stats?.offerItems || [])
            .map((offerItemStats) => {
                const variantCounts = computeCountsByVariant(offerItemStats.data, offerItemStats.orderItems);
                const totalQuantity = computeTotalQuantity(offerItemStats.data, variantCounts)
                const measure = servingPreset(offerItemStats.data).measure;

                return {
                    ...offerItemStats,
                    key: offerItemStats.data.key,
                    variantCounts,
                    totalQuantity,
                    measure,
                    // Keyed off the event existing, not off a truthy quantity — a package
                    // that turned out to be empty is a legitimate zero.
                    quantityLeft: offerItemStats.lastUnsealAt
                        ? quantityLeft(offerItemStats.unsealQuantity, totalQuantity)
                        : null,
                };
            })
    })

    onMount(() => {
        import("bootstrap/dist/js/bootstrap.bundle.min.js")
    });
</script>

<main class="backstage-content" data-page="bar.dashboard">
    <header class="page-header">
        <h1>{data.ref === 'new' ? m["baroo.backstage.bar.create_title"]() : m["baroo.backstage.bar.dashboard_title"]({ barName: data.bar?.name || '' })}</h1>
    </header>

    {#if data.ref === 'new'}
        <div class="card card-body info-message">
            <p><strong>{m["baroo.backstage.bar.create_info"]()}</strong></p>
        </div>
        <div class="card" style="max-width: 600px; margin-top: 2rem;">
            <form method="POST" action="?/save" use:enhance class="card-body flow-block">
                <div class="input-pair">
                    <label for="slug" class="form-label">{m["baroo.backstage.bar.slug"]()}</label>
                    <input
                        type="text"
                        id="slug"
                        name="slug"
                        class="form-control"
                        value={form?.data?.slug ?? ''}
                        required
                        pattern="[a-z0-9\-]+"
                        placeholder={m["baroo.backstage.bar.placeholder_slug"]()}
                        class:error={form?.errors?.slug}
                    />
                    {#if form?.errors?.slug}
                        <span class="error-message">{form.errors.slug}</span>
                    {/if}
                    <small>{m["baroo.backstage.bar.slug_help"]()}</small>
                </div>

                <div class="input-pair">
                    <label for="name" class="form-label">{m["baroo.backstage.bar.name"]()}</label>
                    <input
                        type="text"
                        id="name"
                        name="name"
                        class="form-control"
                        value={form?.data?.name ?? ''}
                        required
                        placeholder={m["baroo.backstage.bar.placeholder_name"]()}
                        class:error={form?.errors?.name}
                    />
                    {#if form?.errors?.name}
                        <span class="error-message">{form.errors.name}</span>
                    {/if}
                    <small>{m["baroo.backstage.bar.name_help"]()}</small>
                </div>

                <div class="actions">
                    <button type="submit" class="btn btn-primary">{m["baroo.backstage.bar.create_bar"]()}</button>
                </div>
            </form>
        </div>
    {:else}

        <div class="dashboard-grid row">
            <section class="col-md-8" data-name="bar-info">
                <div class="card">
                    <div class="card-header">
                        <h2>{m["baroo.backstage.bar.bar_info"]()}</h2>
                        <div class="actions">
                            <div class="dropdown">
                                <button class="btn btn-sm btn-secondary dropdown-toggle"
                                    type="button"
                                    data-bs-toggle="dropdown"
                                    aria-expanded="false"
                                >{m["baroo.backstage.bar.manage"]()}</button>
                                <ul class="dropdown-menu">
                                    <li>
                                        <form method="POST" use:enhance>
                                            <button
                                                type="submit"
                                                formaction="?/delete"
                                                class="dropdown-item text-danger"
                                                disabled
                                                onclick={(e) => {
                                                    if (!confirm(m["baroo.backstage.bar.delete_confirm"]())) {
                                                        e.preventDefault();
                                                    }
                                                }}
                                            >
                                                {m["baroo.backstage.bar.delete_bar"]()}
                                            </button>
                                        </form>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    <form method="POST" action="?/save" use:enhance class="card-body flow-block">
                        <div class="input-pair">
                            <label for="slug" class="form-label">{m["baroo.backstage.bar.slug"]()}</label>
                            <input
                                type="text"
                                id="slug"
                                name="slug"
                                class="form-control"
                                value={form?.data?.slug ?? data.bar?.slug ?? ''}
                                required
                                pattern="[a-z0-9\-]+"
                                placeholder={m["baroo.backstage.bar.placeholder_slug"]()}
                                class:error={form?.errors?.slug}
                            />
                            {#if form?.errors?.slug}
                                <span class="error-message">{form.errors.slug}</span>
                            {/if}
                            <small>{m["baroo.backstage.bar.slug_help"]()}</small>
                        </div>

                        <div class="input-pair">
                            <label for="name" class="form-label">{m["baroo.backstage.bar.name"]()}</label>
                            <input
                                type="text"
                                id="name"
                                name="name"
                                class="form-control"
                                value={form?.data?.name ?? data.bar?.name ?? ''}
                                required
                                placeholder={m["baroo.backstage.bar.placeholder_name"]()}
                                class:error={form?.errors?.name}
                            />
                            {#if form?.errors?.name}
                                <span class="error-message">{form.errors.name}</span>
                            {/if}
                            <small>{m["baroo.backstage.bar.name_help"]()}</small>
                        </div>

                        <div class="actions">
                            <button type="submit" class="btn btn-primary">{m["baroo.backstage.bar.save_changes"]()}</button>
                        </div>

                        {#if form?.success && form?.action !== 'createEvent'}
                            <div class="alert alert-success">{m["baroo.backstage.bar.save_success"]()}</div>
                        {/if}
                    </form>
                </div>
            </section>

            <section class="col-md-4" data-name="member-stats">
                <div class="card">
                    <div class="card-header">
                        <h2>{m["baroo.backstage.bar.members"]()}</h2>
                    </div>
                    <div class="card-body">
                        <p>{m["baroo.backstage.bar.most_orders"]()}</p>
                        <ol class="ranking">
                            {#each data.stats?.memberStats.slice(0, 10) as stat (stat.member.id)}
                                <li>
                                    <span class="name">{stat.member.nickName}</span>
                                    <span class="stats">
                                        <span class="stat-item">{stat.orderCount}×</span>
                                    </span>
                                </li>
                            {/each}
                        </ol>
                    </div>
                </div>
            </section>

            <!-- Offer Items Section -->
            <section class="offer-items-section">
                <header>
                    <h2>{m["baroo.backstage.bar.offer_items_usage"]()}</h2>
                </header>

                {#if data.stats?.offerItems && data.stats.offerItems.length > 0}
                    <div class="items-grid">
                        {#each offerItemUsage as offerItem (offerItem.data.key)}
                            <div class="card">
                                <header class="card-header">
                                    <h3>{offerItem.data.name}</h3>
                                    <div class="actions">
                                        <div class="dropdown">
                                            <button
                                                class="btn btn-sm btn-secondary dropdown-toggle"
                                                type="button"
                                                data-bs-toggle="dropdown"
                                                aria-expanded="false"
                                            >
                                                {m['baroo.backstage.bar.package_sequenced']({ sequenceNumber: offerItem.unsealCount })}
                                            </button>
                                            <ul class="dropdown-menu">
                                                <li>
                                                    <form method="POST" action="?/createEvent" use:enhance class="unseal-form">
                                                        <input type="hidden" name="eventType" value="unseal" />
                                                        <input type="hidden" name="offerItemKey" value={offerItem.data.key} />
                                                        <input
                                                            type="number"
                                                            name="quantity"
                                                            class="form-control form-control-sm"
                                                            min={offerItem.measure === 'count' ? 1 : 0.1}
                                                            step={offerItem.measure === 'count' ? 1 : 0.1}
                                                            required
                                                            placeholder={m["baroo.backstage.bar.unseal_quantity"]({
                                                                measure: measureLabel(offerItem.measure),
                                                            })}
                                                        />
                                                        <button type="submit" class="dropdown-item">
                                                            {m["baroo.backstage.bar.unseal"]()}
                                                        </button>
                                                    </form>
                                                </li>
                                                {#if data.stats?.closureEvents?.[offerItem.data.key] && data.stats.closureEvents[offerItem.data.key].length > 0}
                                                    <li><hr class="dropdown-divider" /></li>
                                                    {#each data.stats.closureEvents[offerItem.data.key] as closure, index}
                                                        <li>
                                                            <button
                                                                type="button"
                                                                class="dropdown-item"
                                                                onclick={() => {
                                                                    openDrawer = { offerItemKey: offerItem.data.key, closureIndex: index };
                                                                }}
                                                            >
                                                                #{data.stats.closureEvents[offerItem.data.key].length - index} - {new Date(closure.created).toLocaleDateString()}
                                                            </button>
                                                        </li>
                                                    {/each}
                                                {/if}
                                            </ul>
                                        </div>
                                    </div>

                                </header>

                                <div class="card-body flow-block offer-item-body">
                                    <div class="items-grid -tight">
                                        {#each Object.entries(offerItem.variantCounts) as [variant, count]}
                                            <div class="tile">
                                                <span class="label">{variant === '_other_'
                                                    ? m["baroo.backstage.bar.other_variants"]()
                                                    : servingLabel(offerItem.data, variant)}</span>
                                                <span role="separator">×</span>

                                                <span class="value">{count}</span>
                                            </div>
                                        {/each}
                                    </div>
                                    <div class="alert alert-success">
                                        <strong>{m["baroo.backstage.bar.total_quantity"]()}</strong>
                                        {formatQuantity(offerItem.measure, offerItem.totalQuantity)}
                                        {#if offerItem.quantityLeft !== null}
                                            <span class="quantity-left">
                                                {m["baroo.backstage.bar.quantity_left"]({
                                                    left: formatQuantity(offerItem.measure, offerItem.quantityLeft),
                                                    total: formatQuantity(offerItem.measure, offerItem.unsealQuantity),
                                                })}
                                            </span>
                                        {/if}
                                    </div>
                                </div>
                            </div>
                        {/each}
                    </div>
                {:else}
                    <div class="empty-state">
                        <p>{m["baroo.backstage.bar.no_items"]()} <a href="/backstage/bars/{data.ref}/offer">{m["baroo.backstage.bar.add_items_link"]()}</a> {m["baroo.backstage.bar.to_get_started"]()}</p>
                    </div>
                {/if}
            </section>
        </div>
    {/if}

    <!-- Drawer for closure event details -->
    {#if openDrawer && data.stats?.closureEvents?.[openDrawer.offerItemKey]?.[openDrawer.closureIndex]}
        {@const closure = data.stats.closureEvents[openDrawer.offerItemKey][openDrawer.closureIndex]}
        {@const sequenceNumber = data.stats.closureEvents[openDrawer.offerItemKey].length - openDrawer.closureIndex}
        <Drawer bind:isOpen={() => !!openDrawer, (value) => openDrawer = value ? openDrawer : null}>
            {#snippet heading()}#{sequenceNumber} - {closure.data.offerItemName}{/snippet}
            <ClosureDetails event={closure} />
        </Drawer>
    {/if}
</main>

<style lang="scss">

.offer-item-body {
    --item-size: 120px;

    .alert {
        margin-block-end: 0;
    }

    .quantity-left {
        display: block;
        opacity: 0.75;
    }

    .last-unseal-info {
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

.unseal-form {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding-inline: 0.5rem;

    input[name="quantity"] {
        inline-size: 6rem;
    }
}

.ranking {
    li {
        display: flex;
        justify-content: space-between;
        align-items: center;

        .stats {
            display: flex;
            gap: 0.5rem;
            font-size: 0.9rem;

            .stat-item {
                color: #6c757d;
                font-weight: 500;
            }
        }
    }
}

.closure-details {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;

    .closure-info {
        font-size: 0.95rem;

        p {
            margin: 0.5rem 0;
        }
    }

    .variant-breakdown,
    .member-stats {
        strong {
            display: block;
            margin-bottom: 0.75rem;
            color: #495057;
            font-size: 1rem;
        }
    }

    .member-stats {
        table {
            margin-bottom: 0;
            font-size: 0.9rem;
        }
    }
}

</style>
