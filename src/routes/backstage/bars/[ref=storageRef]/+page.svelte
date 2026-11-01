<script lang="ts">
    import * as m from '$lib/paraglide/messages.js';
    import type { PageData, ActionData } from './$types';
    import { enhance } from '$app/forms';
    import { onMount } from 'svelte';
    import { measureLabel } from '$lib/bar/quantity';
    import { computeOfferStock } from '$lib/bar/stats/barOfferItems';
    import ClosureDetails from './ClosureDetails.svelte';
    import { getUiLayers } from '$lib/ui/uiLayers.svelte';
    import OfferStockBoard from '../../../bar/[ref=storageRef]/OfferStockBoard.svelte';
    import type { BarOfflineStore } from '$lib/offline/store.svelte';
    import { type BarOfferItem } from '$lib/bar/BarModel';
    import { type Measure } from '$lib/si/measure';
    import { servingPreset } from '$lib/bar/servings';
    import FormErrors from '$lib/components/FormErrors.svelte';

    const uiLayers = getUiLayers()

    let { data, form }: { data: PageData; form: ActionData } = $props();
    const snapshot = $derived(data.snapshot)

    const store = $derived.by((): Pick<BarOfflineStore, "stock"> | null => {
        if (!snapshot) return null

        const orderItems = Object.values(snapshot.timelines)
            .map((timeline) => timeline.filter((item) => item.type === "order"))
            .flat()
            .map((orderItem) => ({ ...orderItem.data, orderedAt: orderItem.date }))

        return {
            stock: computeOfferStock({
                offerItems: snapshot.offerItems,
                orderItems: orderItems,
                unseals: snapshot.unseals,
            }),
        }
    })
    const memberStats = $derived.by(() => {
        if (!snapshot) return []
        return snapshot.members
            .map((member) => {
                return {
                    member,
                    orderCount: snapshot.timelines[member.id]?.filter((event) => event.type === "order").length ?? 0,
                }
            })
            .sort((a, b) => b.orderCount - a.orderCount)
            .slice(0, 6)
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
                    <FormErrors error={form?.errors?.slug}/>
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
                    <FormErrors error={form?.errors?.name}/>
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
                            <FormErrors error={form?.errors?.slug}/>
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
                            <FormErrors error={form?.errors?.name}/>
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
                            {#each memberStats as stat (stat.member.id)}
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

            {#if store}
            <OfferStockBoard
                store={store}
            >
            {#snippet actionsMenu(offerItem, btnAtrs)}
                {@const itemClosures = snapshot?.unseals[offerItem.key] ?? []}
                <li>
                    <button
                        type="button"
                        class="dropdown-item"
                        {...btnAtrs}
                        onclick={() => {
                            const measure = servingPreset(offerItem.servingPreset).measure
                            const layer = uiLayers.pushSnippet(unsealItemForm, {
                                offerItem,
                                measure,
                                onSuccess: (() => layer.ctrl.close()) as () => unknown
                            }, {
                                heading: m["baroo.backstage.bar.unseal"]() + " " + offerItem.name,
                            })
                        }}
                    >
                        {m["baroo.backstage.bar.unseal"]()}
                    </button>
                </li>
                {#each itemClosures as closure, index}
                    <li>
                        <button
                            type="button"
                            class="dropdown-item"
                            {...btnAtrs}
                            onclick={() => {
                                const sequenceNumber = itemClosures.length - index

                                uiLayers.pushComponent(ClosureDetails, {event: closure, offerItem: offerItem}, {
                                    heading: `#${sequenceNumber} - ${offerItem.name}`
                                })
                            }}
                        >
                            #{itemClosures.length - index} - {new Date(closure.occurredAt).toLocaleDateString()}
                        </button>
                    </li>
                {/each}
            {/snippet}
            </OfferStockBoard>
            {/if}
        </div>
    {/if}
</main>

{#snippet unsealItemForm({ offerItem, measure, onSuccess }: { offerItem: BarOfferItem, measure: Measure, onSuccess: () => unknown })}
    <form method="POST" action="?/createEvent" use:enhance={() => {
        return async ({ update, result }) => {
            await update()
            onSuccess()
        }
    }}>
        <input type="hidden" name="eventType" value="unseal" />
        <input type="hidden" name="offerItemKey" value={offerItem.key} />
        <div class="input-group input-group-sm">
            <input
                type="number"
                name="quantity"
                class="form-control"
                min={measure === 'count' ? 1 : 0.1}
                step={measure === 'count' ? 1 : 0.1}
                required
                placeholder={m["baroo.backstage.bar.unseal_quantity"]({
                    measure: measureLabel(measure),
                })}
            />
            <button type="submit" class="btn btn-primary">
                {m["baroo.backstage.bar.unseal"]()}
            </button>
        </div>
    </form>
{/snippet}

<style lang="scss">

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

</style>
