<script lang="ts" module>
    import type { BarOfferItem } from "$lib/bar/BarModel";
    import { type Serving } from "$lib/bar/servings";
    import type { TagMapping } from "$lib/bar/tags";

    /** A pending offer of a tap, waiting for its serving on the kiosk */
    export type PendingOrder = {
        /** Venue server's id of the offer, the order's clientId derives from it */
        id: string;
        tap: string;
        mapping: TagMapping;
        label: string;
        /** What the tap pours */
        offerItemKey: string;
    };
</script>

<script lang="ts">
    import * as m from "$lib/paraglide/messages.js";
    import { servingText } from "$lib/bar/servings";
    import { getRenderer } from "$lib/rendering.svelte";
    import { barMemberAvatar, entityFileHref } from "$lib/ui/pbFiles";

    const renderer = getRenderer();

    const {
        orders,
        offerItems,
        onServe,
        onDismiss,
    }: {
        orders: PendingOrder[];
        offerItems: BarOfferItem[];
        onServe: (order: PendingOrder, item: BarOfferItem, serving: Serving) => void;
        onDismiss: (order: PendingOrder) => void;
    } = $props();

    let dialog = $state<HTMLDialogElement>();

    // Open while somebody waits, on top of any other dialog
    $effect(() => {
        if (!dialog) return;
        if (orders.length && !dialog.open) dialog.showModal();
        if (!orders.length && dialog.open) dialog.close();
    });

    /** Browsers may close a modal despite the refused cancel */
    function keepOpen() {
        if (orders.length) dialog?.showModal();
    }
</script>

<dialog
    id="pendingOffersDialog"
    bind:this={dialog}
    oncancel={(event) => event.preventDefault()}
    onclose={keepOpen}
>
    <div class="orders">
        {#each orders as order (order.id)}
            {@const item = offerItems.find((candidate) => candidate.key === order.offerItemKey)}
            <article class="card pending-order" data-tap={order.tap}>
                <div class="card-header">
                    <img
                        class="avatar-1x1"
                        src={barMemberAvatar(order.mapping.member.id, order.mapping.extra?.avatar_1x1 as string)}
                        alt=""
                    />
                    <h2>{order.label}</h2>
                    <span class="tap">{m["baroo.bar.tap.title"]({ tap: order.tap })}</span>
                    <button
                        type="button"
                        class="dismiss"
                        aria-label={m["baroo.bar.tap.dismiss"]()}
                        onclick={() => onDismiss(order)}>✖</button
                    >
                </div>
                <div class="card-body">
                    {#if item}
                        <div class="offer-item">
                            {#if item.preview_1x1}
                                <img src={entityFileHref('bar_offer_items', item.id, item.preview_1x1)} alt="" />
                            {/if}
                            <span class="name">{item.name}</span>
                        </div>
                        <div class="servings">
                            {#each item.servings as serving (serving.key)}
                                <button
                                    type="button"
                                    class="btn btn-primary serving"
                                    data-serving={serving.key}
                                    onclick={() => onServe(order, item, serving)}
                                >
                                    <span class="serving-name">{renderer.print(serving.name)}</span>
                                    <span class="serving-amount">{servingText(serving, item.measure)}</span>
                                </button>
                            {/each}
                        </div>
                    {:else}
                        <p class="unknown-item">⚠️ {m["baroo.bar.tap.unknown_item"]({ key: order.offerItemKey })}</p>
                    {/if}
                </div>
            </article>
        {/each}
    </div>
</dialog>

<style lang="scss">
    #pendingOffersDialog {
        width: min(60rem, 90vw);
    }

    .orders {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 24rem), 1fr));
        gap: 1rem;
        max-height: calc(95vh - 2rem);
        overflow-y: auto;
    }

    .pending-order {
        .card-header {
            align-items: center;
        }

        h2 {
            flex: 1;
            font-size: 1.75rem;
        }

        .tap {
            font-weight: 600;
            white-space: nowrap;
            color: var(--bs-secondary-color);
        }

        .dismiss {
            border: 0;
            background: none;
            padding: 0 0.25rem;
            font-size: 1.5rem;
            line-height: 1;
            opacity: 0.6;
        }
    }

    .offer-item {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        margin-block-end: 1rem;

        img {
            width: 4rem;
            height: 4rem;
            object-fit: contain;
        }

        .name {
            font-size: 1.5rem;
            font-weight: 600;
        }
    }

    .servings {
        display: grid;
        grid-auto-flow: column;
        grid-auto-columns: 1fr;
        gap: 1rem;
    }

    .serving {
        min-height: 7rem;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.25rem;
    }

    .serving-name {
        font-size: 2.25rem;
        font-weight: 700;
        line-height: 1;
    }

    .serving-amount {
        font-size: 1.1rem;
        opacity: 0.85;
    }

    .unknown-item {
        margin: 0;
    }
</style>
