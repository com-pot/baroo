<script lang="ts">
    import * as m from '$lib/paraglide/messages.js';
    import type { PageData, ActionData } from './$types';
    import { applyAction, deserialize, enhance } from '$app/forms';
    import { invalidateAll } from '$app/navigation';
    import { onMount } from 'svelte';
    import { formatQuantity } from '$lib/bar/quantity';
    import { compareTaps, type OfferStock } from '$lib/bar/stats/barOfferItems';
    import { effectiveDate } from '$lib/bar/BarModel';
    import ClosureDetails from './ClosureDetails.svelte';
    import UnsealForm from './UnsealForm.svelte';
    import { getUiLayers } from '$lib/ui/uiLayers.svelte';
    import OfferStockBoard from '../../../bar/[ref=storageRef]/OfferStockBoard.svelte';
    import TapBadge from '../../../bar/[ref=storageRef]/TapBadge.svelte';
    import type { BarOfflineStore } from '$lib/offline/store.svelte';
    import FormErrors from '$lib/components/FormErrors.svelte';
    import { TAP_STALE_MS, type TapState } from '$lib/taps/tapEvents';
    import { TapStream } from '$lib/taps/tapStream.svelte';

    const uiLayers = getUiLayers()

    let { data, form }: { data: PageData; form: ActionData } = $props();
    const snapshot = $derived(data.snapshot)

    // The venue server's taps, live while its stream is up
    let tapStream = $state<TapStream | undefined>();
    const taps = $derived<TapState[]>(tapStream?.connected ? tapStream.taps : data.taps);

    const store = $derived.by((): Pick<BarOfflineStore, "stock"> | null => {
        if (!snapshot) return null

        return {
            stock: data.stock.map((entry): OfferStock => {
                const onTaps = taps.filter((state) => state.offerItemKey === entry.item.key);
                const live = onTaps.find((state) => state.stock)?.stock;

                return {
                    ...entry,
                    taps: onTaps.map((state) => state.tap),
                    ...(live ? { left: live.left, unsealQuantity: live.quantity, unsealedAt: live.unsealedAt } : {}),
                };
            }),
        }
    })

    onMount(() => {
        if (!data.liveTaps || !data.bar) return;

        const stream = new TapStream({ barSlug: data.bar.slug });
        tapStream = stream;
        return stream.start();
    });

    // Ticks so TapTappers that went quiet show as stale
    let now = $state(Date.now());
    onMount(() => {
        const timer = setInterval(() => (now = Date.now()), 5_000);
        return () => clearInterval(timer);
    });

    function tapperAlive(tap: string): boolean | null {
        if (tapStream?.connected) {
            const heardAt = tapStream.taps.find((state) => state.tap === tap)?.heardAt ?? null;
            return heardAt === null ? null : now - heardAt < TAP_STALE_MS;
        }

        const tapper = data.taps.find((state) => state.tap === tap)?.tapper;
        return tapper ? now - Date.parse(tapper.lastSeenAt) < TAP_STALE_MS : null;
    }

    /** What got closed of an item: its flushes, and the unseals from before flushes that carried it */
    function closuresOf(offerItemKey: string) {
        if (!snapshot) return []

        return [
            ...(snapshot.flushes?.[offerItemKey] ?? [])
                .map((event) => ({ closure: event.data.closureData, closedAt: effectiveDate(event) })),
            ...(snapshot.unseals[offerItemKey] ?? [])
                .flatMap((event) => event.data.closureData ? [{ closure: event.data.closureData, closedAt: effectiveDate(event) }] : []),
        ].sort((a, b) => b.closedAt.localeCompare(a.closedAt))
    }

    async function flushOffer(entry: OfferStock) {
        const confirmed = confirm(m["baroo.bar.stock.flush_confirm"]({
            name: entry.item.name,
            left: entry.left === null ? "?" : formatQuantity(entry.measure, entry.left),
        }))
        if (!confirmed) return

        const body = new FormData()
        body.set('offerItemKey', entry.item.key)
        body.set('tap', entry.taps[0] ?? '')

        const response = await fetch('?/flush', {
            method: 'POST',
            body,
            headers: { 'x-sveltekit-action': 'true' },
        })
        const result = deserialize(await response.text())

        if (result.type === 'success') await invalidateAll()
        await applyAction(result)
    }

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

                        {#if form?.success && !form?.action}
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

            {#if taps.length}
            <section class="col-12" data-name="taps">
                <div class="card">
                    <div class="card-header">
                        <h2>{m["baroo.backstage.bar.taps"]()}</h2>
                    </div>
                    <ul class="card-body tap-states">
                        {#each taps.toSorted((a, b) => compareTaps(a.tap, b.tap)) as state (state.tap)}
                            <li>
                                <TapBadge tap={state.tap} alive={tapperAlive(state.tap)} />
                                <span class="on-tap" class:none={!state.offerItemKey}>
                                    {state.offerItemKey
                                        ? snapshot?.offerItems.find((item) => item.key === state.offerItemKey)?.name ?? state.offerItemKey
                                        : m["baroo.bar.tap.nothing_on_tap"]()}
                                </span>
                                {#if state.stock}
                                    {@const measure = data.stock.find((entry) => entry.item.key === state.offerItemKey)?.measure ?? 'volume'}
                                    <span class="left">
                                        {m["baroo.bar.stock.remaining"]()} {formatQuantity(measure, state.stock.left)}
                                        {m["baroo.bar.stock.of_total"]({ total: formatQuantity(measure, state.stock.quantity) })}
                                    </span>
                                {/if}
                            </li>
                        {/each}
                    </ul>
                </div>
            </section>
            {/if}

            {#if store}
            <OfferStockBoard
                store={store}
            >
            {#snippet tapBadge(tap)}
                <TapBadge {tap} alive={tapperAlive(tap)} />
            {/snippet}
            {#snippet actionsMenu(entry, btnAtrs)}
                {@const itemClosures = closuresOf(entry.item.key)}
                <li>
                    <button
                        type="button"
                        class="dropdown-item"
                        {...btnAtrs}
                        onclick={() => {
                            const layer = uiLayers.pushComponent(UnsealForm, {
                                entry,
                                packages: snapshot?.packages ?? [],
                                taps,
                                offerItems: snapshot?.offerItems ?? [],
                                onSuccess: (() => layer.ctrl.close()) as () => unknown,
                            }, {
                                heading: m["baroo.backstage.bar.unseal"]() + " " + entry.item.name,
                            })
                        }}
                    >
                        {m["baroo.backstage.bar.unseal"]()}
                    </button>
                </li>
                {#if entry.unsealedAt}
                    <li>
                        <button
                            type="button"
                            class="dropdown-item"
                            {...btnAtrs}
                            onclick={() => flushOffer(entry)}
                        >
                            {m["baroo.bar.stock.flush"]()}
                        </button>
                    </li>
                {/if}
                {#each itemClosures as { closure, closedAt }, index}
                    <li>
                        <button
                            type="button"
                            class="dropdown-item"
                            {...btnAtrs}
                            onclick={() => {
                                const sequenceNumber = itemClosures.length - index

                                uiLayers.pushComponent(ClosureDetails, { closure, closedAt, offerItem: entry.item }, {
                                    heading: `#${sequenceNumber} - ${entry.item.name}`
                                })
                            }}
                        >
                            #{itemClosures.length - index} - {new Date(closedAt).toLocaleDateString()}
                        </button>
                    </li>
                {/each}
            {/snippet}
            </OfferStockBoard>
            {/if}
        </div>
    {/if}
</main>


<style lang="scss">

.tap-states {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1.5rem;
    margin: 0;
    list-style: none;

    li {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .on-tap {
        font-weight: 600;

        &.none {
            color: #9ca3af;
            font-style: italic;
            font-weight: 400;
        }
    }

    .left {
        color: #6c757d;
        font-size: 0.9rem;
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

</style>
