<script lang="ts">
    import "$lib/assets/styles/drawer.scss";
    import * as m from "$lib/paraglide/messages.js";
    import type { BarOfflineStore } from "$lib/offline/store.svelte";
    import { formatQuantity } from "$lib/bar/quantity";
    import type { Snippet } from "svelte";
    import type { BarOfferItem } from "$lib/bar/BarModel";
    import { entityFileHref } from "$lib/ui/pbFiles";

    let {
        store,
        actionsMenu,
    }: {
        store: Pick<BarOfflineStore, "stock">,
        actionsMenu?: Snippet<[BarOfferItem, Record<string, unknown>]>,
    } = $props();

    const stockSorted = $derived(store.stock.toSorted((a, b) => {
        if (!a.unsealedAt && !b.unsealedAt) return 0
        if (!b.unsealedAt) return -1
        if (!a.unsealedAt) return 1
        return -a.unsealedAt.localeCompare(b.unsealedAt)
    }))

    const uid = $props.id();
</script>

<section class="stock-board" data-boot>
    <h2>{m["baroo.bar.stock.title"]()}</h2>

    <div class="items-grid -tight" style="--item-size: 18rem;">
        {#each stockSorted as entry (entry.item.key)}
            {@const item = entry.item}
            {@const anchor = `--stock-${uid}-${item.key}`}
            <article
                class="card stock-card"
                data-key={item.key}
                data-level={entry.left === null
                    ? "unknown"
                    : entry.left === 0
                        ? "empty"
                        : entry.left <= entry.unsealQuantity * 0.2
                        ? "low"
                        : "ok"}
            >
                <div class="bg frame">
                    {#if item.preview_1x1}
                        <img src={entityFileHref('bar_offer_items', item.id, item.preview_1x1)} alt="" />
                    {:else}
                        <span class="placeholder" aria-hidden="true"></span>
                    {/if}
                </div>

                <div class="heading">
                    <h3>{item.name}</h3>
                    {#if actionsMenu}
                    <button
                        type="button"
                        class="btn btn-icon btn-outline-subtle"
                        aria-label={m["baroo.bar.stock.actions"]()}
                        popovertarget="{uid}-actions-{item.key}"
                        style:anchor-name={anchor}
                    >⋯</button>
                    {/if}
                </div>

                <div class="body">
                    {#if entry.left === null}
                        <div class="gauge">
                            <progress></progress>
                            <div class="label">
                                <span>{m["baroo.bar.stock.not_unsealed"]()}</span>
                            </div>
                        </div>
                    {:else}
                        {@const qRemaining = entry.left}
                        {@const qTotal = formatQuantity(entry.measure, entry.unsealQuantity)}
                        <div class="gauge"
                            title={`${m["baroo.bar.stock.remaining"]()} ${qRemaining} ${m["baroo.bar.stock.of_total"]({ total: qTotal })}`}
                        >
                            <progress value={Math.max(0, entry.left)} max={entry.unsealQuantity}></progress>
                            <div class="label" role="presentation">
                                <span class="left">{qRemaining}</span>
                                <span role="separator"></span>
                                <span class="total">{qTotal}</span>
                            </div>
                        </div>
                    {/if}
                </div>

                {#if actionsMenu}
                {@const popoverId = `${uid}-actions-${item.key}`}
                {@const btnAttrs = {
                    popovertarget: popoverId,
                    popovertargetaction: "hide",
                }}
                <menu
                    popover
                    id={popoverId}
                    class="actions-popover"
                    style:position-anchor={anchor}
                >
                    {@render actionsMenu(item, btnAttrs)}
                </menu>
                {/if}
            </article>
        {:else}
        <div class="card empty-state">
            <p>{m["baroo.bar.stock.empty"]()}</p>
        </div>
        {/each}
    </div>
</section>

<style lang="scss">
    .stock-card {
        --card-padding: 0.25rem 0.5rem;
        display: grid;
        grid-template-areas:
            "heading"
            "body";
        gap: 0.15rem 0.75rem;
        align-items: center;
        padding: var(--card-padding);

        position: relative;
        overflow: clip;

        &[data-level="low"] { --accent-rgb: 178, 106, 0; }
        &[data-level="empty"] { --accent-rgb: 176, 42, 55; }

        .frame {
            top: 50%; left: 0;
            translate: 0 -50%;

            width: 8rem;
            aspect-ratio: 1 / 1;
            display: grid;
            place-items: center;
        }
    }

    .heading {
        grid-area: heading;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;

        h3 {
            margin: 0;
            font-size: 1.1rem;
            font-weight: 600;
            color: #374151;
        }
    }

    .body {
        grid-area: body;

        display: flex;
        align-items: baseline;
        flex-wrap: wrap;
        gap: 0 0.4rem;
    }

    .gauge {
        display: grid;
        place-items: center;

        > * {
            grid-area: 1/1;
            border-radius: var(--bs-card-border-radius);
        }

        progress {
            height: 100%;
            border-radius: var(--bs-card-border-radius);

            box-shadow: 1px 1px 4px rgba( 0, 0, 0, 0.2 );
        }
        progress::-webkit-progress-bar {
            border-radius: var(--bs-card-border-radius);
            background-color: transparent;
            backdrop-filter: blur(4px);
        }
        progress::-webkit-progress-value {
            background-color: rgb(var(--accent-rgb, var(--bs-primary-rgb)), 0.5);
            border-radius: var(--bs-card-border-radius);
        }

        .label {
            margin: 0.2em 0.5em;
            padding: 0.1em 0.2em;

            line-height: 1;

            background-color: rgba(var(--bs-body-bg-rgb), 0.6);
            border: 1px solid var(--bs-card-border-color);
            backdrop-filter: blur(4px);

            > [role="separator"]::after {
                content: "/";
                display: inline-block;
            }
        }
        .left {
            font-weight: 700;
            color: rgb(var(--accent-rgb, 0 0 0));
        }
    }
</style>
