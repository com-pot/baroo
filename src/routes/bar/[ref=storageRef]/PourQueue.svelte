<script lang="ts" module>
    import type { TagMapping } from "$lib/bar/tags";

    /** A member card tapped at a spigot, waiting for the barman to say how much was poured. */
    export type PendingPour = {
        /** The venue server's id for the pour; the order is keyed off it. */
        id: string;
        spigot: string;
        mapping: TagMapping;
        /** The member's name as the card shows it. */
        label: string;
        /** Offer item key the spigot reported. Looked up when drawn, so a pull can mend it. */
        beverage: string;
    };
</script>

<script lang="ts">
    import * as m from "$lib/paraglide/messages.js";
    import type { BarOfferItem } from "$lib/bar/BarModel";
    import { servingPreset, servingsOf, servingText, type Serving } from "$lib/bar/servings";
    import { getRenderer } from "$lib/rendering.svelte";

    const renderer = getRenderer();

    const {
        pours,
        offerItems,
        onServe,
        onDismiss,
    }: {
        pours: PendingPour[];
        offerItems: BarOfferItem[];
        onServe: (pour: PendingPour, item: BarOfferItem, serving: Serving) => void;
        onDismiss: (pour: PendingPour) => void;
    } = $props();

    let dialog = $state<HTMLDialogElement>();

    // Open exactly while somebody is waiting. A pour that arrives while the barman is in
    // another dialog lands on top of it — the customer is the one standing at the tap.
    $effect(() => {
        if (!dialog) return;
        if (pours.length && !dialog.open) dialog.showModal();
        if (!pours.length && dialog.open) dialog.close();
    });

    /**
     * Escape is refused below, but a browser may still close a modal on its own terms —
     * and a closed dialog would hide people who are still waiting for their drink.
     */
    function keepOpen() {
        if (pours.length) dialog?.showModal();
    }

    /**
     * The sizes worth a button. Priced ones, as in the order dialog — unless the item has
     * no prices at all, where every size beats a pour that cannot be written down.
     */
    function servingsFor(item: BarOfferItem): readonly Serving[] {
        const all = servingsOf(item);
        const priced = all.filter((serving) => item.pricing?.[serving.key] != null);
        return priced.length ? priced : all;
    }
</script>

<dialog
    id="pourDialog"
    bind:this={dialog}
    oncancel={(event) => event.preventDefault()}
    onclose={keepOpen}
>
    <div class="pours">
        {#each pours as pour (pour.id)}
            {@const item = offerItems.find((candidate) => candidate.key === pour.beverage)}
            <article class="card pour" data-spigot={pour.spigot}>
                <div class="card-header">
                    <img
                        class="avatar-1x1"
                        src={pour.mapping.extra?.avatar_1x1
                            ? `/storage/api/files/bar_members/${pour.mapping.member.id}/${pour.mapping.extra.avatar_1x1}`
                            : '/assets/default-badge.svg'
                        }
                        alt=""
                    />
                    <h2>{pour.label}</h2>
                    <span class="spigot">{m["baroo.bar.spigot.title"]({ spigot: pour.spigot })}</span>
                    <button
                        type="button"
                        class="dismiss"
                        aria-label={m["baroo.bar.spigot.dismiss"]()}
                        onclick={() => onDismiss(pour)}>✖</button
                    >
                </div>
                <div class="card-body">
                    {#if item}
                        {@const measure = servingPreset(item).measure}
                        <div class="beverage">
                            {#if item.preview_1x1}
                                <img src={`/storage/api/files/bar_offer_items/${item.id}/${item.preview_1x1}`} alt="" />
                            {/if}
                            <span class="name">{item.name}</span>
                        </div>
                        <div class="servings">
                            {#each servingsFor(item) as serving (serving.key)}
                                <button
                                    type="button"
                                    class="btn btn-primary serving"
                                    data-serving={serving.key}
                                    onclick={() => onServe(pour, item, serving)}
                                >
                                    <span class="serving-name">{renderer.print(serving.name)}</span>
                                    <span class="serving-amount">{servingText(serving, measure)}</span>
                                </button>
                            {/each}
                        </div>
                    {:else}
                        <p class="unknown-item">⚠️ {m["baroo.bar.spigot.unknown_item"]({ key: pour.beverage })}</p>
                    {/if}
                </div>
            </article>
        {/each}
    </div>
</dialog>

<style lang="scss">
    #pourDialog {
        width: min(60rem, 90vw);
    }

    .pours {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 24rem), 1fr));
        gap: 1rem;
        max-height: calc(95vh - 2rem);
        overflow-y: auto;
    }

    .pour {
        .card-header {
            align-items: center;
        }

        h2 {
            flex: 1;
            font-size: 1.75rem;
        }

        .spigot {
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

    .beverage {
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
