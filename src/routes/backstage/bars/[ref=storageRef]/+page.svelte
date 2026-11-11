<script lang="ts">
    import * as m from '$lib/paraglide/messages.js';
    import type { PageData, ActionData } from './$types';
    import { applyAction, deserialize, enhance } from '$app/forms';
    import { invalidateAll } from '$app/navigation';
    import { onMount } from 'svelte';
    import { formatQuantity } from '$lib/bar/quantity';
    import { servingPreset } from '$lib/bar/servings';
    import { packageState, type BarOfferItem } from '$lib/bar/BarModel';
    import { compareTaps } from '$lib/bar/stats/barOfferItems';
    import ClosureDetails from './ClosureDetails.svelte';
    import UnsealForm from './UnsealForm.svelte';
    import { getUiLayers } from '$lib/ui/uiLayers.svelte';
    import StockCard from '../../../bar/[ref=storageRef]/StockCard.svelte';
    import TapBadge from '../../../bar/[ref=storageRef]/TapBadge.svelte';
    import FormErrors from '$lib/components/FormErrors.svelte';
    import { TAP_STALE_MS, type TapState } from '$lib/taps/tapEvents';
    import { TapStream } from '$lib/taps/tapStream.svelte';

    const uiLayers = getUiLayers()

    let { data, form }: { data: PageData; form: ActionData } = $props();
    const snapshot = $derived(data.snapshot)

    // The taps, live while the stream is up
    let tapStream = $state<TapStream | undefined>();
    const taps = $derived<TapState[]>((tapStream?.connected ? tapStream.taps : data.taps)
        .toSorted((a, b) => compareTaps(a.tap, b.tap)));

    const offerItemOf = (key: string | null): BarOfferItem | null =>
        (key && snapshot?.offerItems.find((item) => item.key === key)) || null;

    onMount(() => {
        if (!data.taps.length || !data.bar) return;

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

        const lastSeenAt = data.taps.find((state) => state.tap === tap)?.lastSeenAt;
        return lastSeenAt ? now - Date.parse(lastSeenAt) < TAP_STALE_MS : null;
    }

    function openUnseal(state: TapState) {
        const layer = uiLayers.pushComponent(UnsealForm, {
            tap: state,
            offerItems: snapshot?.offerItems ?? [],
            packages: (snapshot?.packages ?? []).filter((offerPackage) => packageState(offerPackage) === 'registered'),
            onSuccess: (() => layer.ctrl.close()) as () => unknown,
        }, {
            heading: `${m["baroo.backstage.bar.unseal"]()} — ${state.label}`,
        })
    }

    async function flushTap(state: TapState, item: BarOfferItem | null) {
        if (!state.stock) return

        const confirmed = confirm(m["baroo.bar.stock.flush_confirm"]({
            name: item?.name ?? state.offerItemKey ?? '',
            left: item ? formatQuantity(item.measure, state.stock.left) : String(state.stock.left),
        }))
        if (!confirmed) return

        const body = new FormData()
        body.set('packageId', state.stock.packageId)

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
                <h2>{m["baroo.backstage.bar.taps"]()}</h2>
                <div class="items-grid -tight" style="--item-size: 15rem;">
                    {#each taps as state (state.tap)}
                        {@const item = offerItemOf(state.offerItemKey)}
                        {@const tapClosures = data.closures[state.tap] ?? []}
                        {#snippet badge()}
                            <TapBadge tap={state.tap} label={state.label} alive={tapperAlive(state.tap)} />
                        {/snippet}
                        {#snippet actions(btnAttrs: Record<string, unknown>)}
                            <li>
                                <button type="button" class="dropdown-item" {...btnAttrs} onclick={() => openUnseal(state)}>
                                    {m["baroo.backstage.bar.unseal"]()}
                                </button>
                            </li>
                            {#if state.stock}
                                <li>
                                    <button type="button" class="dropdown-item" {...btnAttrs} onclick={() => flushTap(state, item)}>
                                        {m["baroo.bar.stock.flush"]()}
                                    </button>
                                </li>
                            {/if}
                            {#each tapClosures as { closure, closedAt }, index}
                                {@const sequenceNumber = tapClosures.length - index}
                                <li>
                                    <button
                                        type="button"
                                        class="dropdown-item"
                                        {...btnAttrs}
                                        onclick={() => {
                                            uiLayers.pushComponent(ClosureDetails, { closure, closedAt, offerItem: offerItemOf(closure.offerItemKey) }, {
                                                heading: `#${sequenceNumber} - ${closure.offerItemName}`
                                            })
                                        }}
                                    >
                                        #{sequenceNumber} - {closure.offerItemName}, {new Date(closedAt).toLocaleDateString()}
                                    </button>
                                </li>
                            {/each}
                        {/snippet}

                        <StockCard
                            {item}
                            title={item?.name ?? state.offerItemKey ?? m["baroo.bar.tap.nothing_on_tap"]()}
                            measure={item ? servingPreset(item.servingPreset).measure : "volume"}
                            left={state.stock?.left ?? null}
                            total={state.stock?.quantity ?? 0}
                            empty={m["baroo.bar.tap.nothing_on_tap"]()}
                            highlight={!!state.stock}
                            {badge}
                            actionsMenu={actions}
                        />
                    {/each}
                </div>
            </section>
            {/if}
        </div>
    {/if}
</main>


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
