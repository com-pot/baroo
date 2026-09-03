<script lang="ts">
    import "$lib/assets/styles/drawer.scss";
    import "$lib/assets/styles/staff-drawer.scss";
    import * as m from "$lib/paraglide/messages.js";
    import type { OfflineBar } from "$lib/offline/store.svelte";
    import { formatQuantity } from "$lib/bar/quantity";
    import Drawer from "$lib/components/Drawer.svelte";
    import UnsealWidget from "./UnsealWidget.svelte";

    /**
     * What is still in the open packages, one card per offer item.
     *
     * The number is the whole point of the board: a barman mid-shift wants to know how
     * much of the keg is left without opening a tool drawer, so the count is read off
     * the same snapshot-plus-outbox view the orders are written into and needs no sync
     * to be current.
     */
    let { bar }: { bar: OfflineBar } = $props();

    const stockSorted = $derived(bar.stock.toSorted((a, b) => {
        if (!a.unsealedAt && !b.unsealedAt) return 0
        if (!b.unsealedAt) return -1
        if (!a.unsealedAt) return 1
        return a.unsealedAt.localeCompare(b.unsealedAt)
    }))

    /** The item whose unseal form is open, if any. */
    let unsealing = $state<string | null>(null);

    // Ids have to be unique in the document, and the kiosk page may hold more than one
    // of these before long — the popovers are wired by id, so they can't share a name.
    const uid = $props.id();
</script>

<section class="stock-board">
    <h2>{m["baroo.bar.stock.title"]()}</h2>

    {#if stockSorted.length}
        <div class="stock-grid">
            {#each stockSorted as entry (entry.item.key)}
                {@const item = entry.item}
                {@const anchor = `--stock-${uid}-${item.key}`}
                <article
                    class="stock-card"
                    data-key={item.key}
                    data-level={entry.left === null
                        ? "unknown"
                        : entry.left === 0
                          ? "empty"
                          : entry.left <= entry.unsealQuantity * 0.2
                            ? "low"
                            : "ok"}
                >
                    <div class="frame preview">
                        {#if item.preview_1x1}
                            <img
                                src={`/storage/api/files/bar_offer_items/${item.id}/${item.preview_1x1}`}
                                alt=""
                            />
                        {:else}
                            <span class="placeholder" aria-hidden="true">{item.name.slice(0, 1)}</span>
                        {/if}
                    </div>

                    <div class="heading">
                        <h3>{item.name}</h3>
                        <button
                            type="button"
                            class="actions-toggle"
                            aria-label={m["baroo.bar.stock.actions"]()}
                            popovertarget="{uid}-actions-{item.key}"
                            style:anchor-name={anchor}
                        >⋯</button>
                    </div>

                    <div class="body">
                        {#if entry.left === null}
                            <span class="not-unsealed">{m["baroo.bar.stock.not_unsealed"]()}</span>
                        {:else}
                            <div>
                                <span class="label">{m["baroo.bar.stock.remaining"]()}</span>
                                <span class="left">{formatQuantity(entry.measure, entry.left)}</span>
                                <span class="of-total">
                                    {m["baroo.bar.stock.of_total"]({
                                        total: formatQuantity(entry.measure, entry.unsealQuantity),
                                    })}
                                </span>
                            </div>
                            <progress value={Math.max(0, entry.left)} max={entry.unsealQuantity}></progress>
                        {/if}
                    </div>

                    <menu
                        popover
                        id="{uid}-actions-{item.key}"
                        class="actions-popover"
                        style:position-anchor={anchor}
                    >
                        <li>
                            <button
                                type="button"
                                popovertarget="{uid}-actions-{item.key}"
                                popovertargetaction="hide"
                                onclick={() => (unsealing = item.key)}
                            >
                                {m["baroo.bar.stock.unseal_new"]()}
                            </button>
                        </li>
                    </menu>
                </article>
            {/each}
        </div>
    {:else}
        <p class="empty">{m["baroo.bar.stock.empty"]()}</p>
    {/if}
</section>

{#if unsealing}
    {@const item = bar.offerItems.find((offer) => offer.key === unsealing)}
    <!-- Closing the drawer by its own X or overlay has to clear the item too, so the
         open flag is derived from `unsealing` in both directions rather than mirrored. -->
    <Drawer bind:isOpen={() => true, (open) => { if (!open) unsealing = null; }}>
        {#snippet heading()}{m["baroo.bar.stock.unseal_new"]()} — {item?.name ?? unsealing}{/snippet}
        <div class="staff-drawer">
            <UnsealWidget
                {bar}
                lockedItemKey={unsealing}
                onDone={() => (unsealing = null)}
            />
        </div>
    </Drawer>
{/if}

<style lang="scss">
    .stock-board {
        margin-block-start: 2rem;

        // The kiosk column is sized for one badge form; a board of cards wants the room
        // the screen actually has, so it steps out of that column and re-centres itself.
        width: min(72rem, calc(100vw - 2rem));
        position: relative;
        left: 50%;
        transform: translateX(-50%);

        > h2 {
            font-size: 0.85rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            color: #6c757d;
            margin-block: 0 0.75rem;
        }

        .empty {
            color: #6b7280;
        }
    }

    .stock-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
        gap: 0.75rem;
    }

    .stock-card {
        --card-padding: 0.75rem;
        display: grid;
        grid-template-columns: auto 1fr;
        grid-template-areas:
            "preview heading"
            "preview body";
        gap: 0.15rem 0.75rem;
        align-items: center;
        padding: var(--card-padding);
        background-color: #f8f9fa;
        border: 1px solid #dee2e6;
        border-radius: 0.5rem;

        // The number is what the card is for, so it carries the warning rather than the
        // whole card turning red and shouting over the four next to it.
        &[data-level="low"] .left {
            color: #b26a00;
        }

        &[data-level="empty"] .left {
            color: #b02a37;
        }
    }

    .frame.preview {
        grid-area: preview;
        // Bleeds into the card's own padding, the way the order dialog's previews do.
        margin: calc(-1 * var(--card-padding)) 0 calc(-1 * var(--card-padding)) 0;
        width: 4.5rem;
        aspect-ratio: 1 / 1;
        display: grid;
        place-items: center;

        img {
            width: 100%;
            height: 100%;
            object-fit: contain;
        }

        .placeholder {
            font-size: 2rem;
            font-weight: 700;
            color: #cbd5e1;
            min-height: 1em;
            min-width: 1em;
            line-height: 1;
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

    .actions-toggle {
        flex-shrink: 0;
        // A thumb target, not a mouse one — this is a tablet behind a bar.
        min-width: 2.5rem;
        min-height: 2.5rem;
        padding: 0;
        line-height: 1;
        font-size: 1.25rem;
        background: transparent;
        border: 1px solid transparent;
        border-radius: 0.375rem;
        color: #6b7280;
        cursor: pointer;

        &:hover,
        &:focus-visible {
            background: #fff;
            border-color: #dee2e6;
        }
    }

    .body {
        grid-area: body;
        display: flex;
        align-items: baseline;
        flex-wrap: wrap;
        gap: 0 0.4rem;

        .label {
            font-size: 0.8rem;
            color: #6b7280;
        }

        .left {
            font-size: 1.4rem;
            font-weight: 700;
            color: #111827;
        }

        .of-total,
        .not-unsealed {
            font-size: 0.85rem;
            color: #6b7280;
        }
    }

    .actions-popover {
        margin: 0;
        padding: 0.25rem;
        list-style: none;
        border: 1px solid #dee2e6;
        border-radius: 0.5rem;
        box-shadow: 0 4px 12px rgb(0 0 0 / 0.12);

        li {
            list-style: none;
        }

        button {
            display: block;
            width: 100%;
            text-align: start;
            white-space: nowrap;
            padding: 0.6rem 0.9rem;
            font: inherit;
            background: transparent;
            border: 0;
            border-radius: 0.375rem;
            cursor: pointer;

            &:hover,
            &:focus-visible {
                background: #f1f3f5;
            }
        }

        // Without anchor positioning the popover lands centred in the viewport, which is
        // a usable menu — just not one attached to the card that opened it.
        @supports (position-area: bottom) {
            position-area: bottom;
            margin-block-start: 0.25rem;
        }
    }
</style>
