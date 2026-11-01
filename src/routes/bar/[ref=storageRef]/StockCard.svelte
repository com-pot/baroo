<script lang="ts">
    import * as m from "$lib/paraglide/messages.js";
    import type { Snippet } from "svelte";
    import type { BarOfferItem } from "$lib/bar/BarModel";
    import { formatQuantity } from "$lib/bar/quantity";
    import type { Measure } from "$lib/si/measure";
    import { entityFileHref } from "$lib/ui/pbFiles";

    let {
        item,
        title,
        measure,
        left,
        total,
        empty,
        highlight = false,
        badge,
        actionsMenu,
    }: {
        /** Lends the card its picture */
        item: Pick<BarOfferItem, "id" | "preview_1x1"> | null,
        title: string,
        measure: Measure,
        /** `null` while nothing is unsealed */
        left: number | null,
        total: number,
        /** Shown on the gauge while nothing is unsealed */
        empty: string,
        highlight?: boolean,
        badge?: Snippet,
        actionsMenu?: Snippet<[Record<string, unknown>]>,
    } = $props();

    const uid = $props.id();
    const anchor = `--stock-${uid}`;
    const popoverId = `${uid}-actions`;
</script>

<article
    class="card stock-card"
    data-level={left === null
        ? "unknown"
        : left === 0
            ? "empty"
            : left <= total * 0.2
            ? "low"
            : "ok"}
    data-highlight={highlight || undefined}
>
    <div class="bg frame">
        {#if item?.preview_1x1}
            <img src={entityFileHref('bar_offer_items', item.id, item.preview_1x1)} alt="" />
        {:else}
            <span class="placeholder" aria-hidden="true"></span>
        {/if}
    </div>

    <div class="heading">
        {#if badge}
            <span class="badges">{@render badge()}</span>
        {/if}
        <h3>{title}</h3>
        {#if actionsMenu}
        <button
            type="button"
            class="btn btn-icon btn-outline-subtle"
            aria-label={m["baroo.bar.stock.actions"]()}
            popovertarget={popoverId}
            style:anchor-name={anchor}
        >⋯</button>
        {/if}
    </div>

    <div class="body">
        {#if left === null}
            <div class="gauge">
                <progress></progress>
                <div class="label">
                    <span>{empty}</span>
                </div>
            </div>
        {:else}
            {@const qTotal = formatQuantity(measure, total)}
            <div class="gauge"
                title={`${m["baroo.bar.stock.remaining"]()} ${left} ${m["baroo.bar.stock.of_total"]({ total: qTotal })}`}
            >
                <progress value={Math.max(0, left)} max={total}></progress>
                <div class="label" role="presentation">
                    <span class="left">{left}</span>
                    <span role="separator"></span>
                    <span class="total">{qTotal}</span>
                </div>
            </div>
        {/if}
    </div>

    {#if actionsMenu}
    <menu
        popover
        id={popoverId}
        class="actions-popover"
        style:position-anchor={anchor}
    >
        {@render actionsMenu({
            popovertarget: popoverId,
            popovertargetaction: "hide",
        })}
    </menu>
    {/if}
</article>

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

        &[data-highlight] {
            border-color: rgb(var(--bs-primary-rgb));
            box-shadow: 0 0 0 1px rgb(var(--bs-primary-rgb));
        }

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
            flex: 1;
            margin: 0;
            font-size: 1.1rem;
            font-weight: 600;
            color: #374151;
        }
    }

    .badges {
        display: flex;
        flex-wrap: wrap;
        gap: 0.25rem;
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
