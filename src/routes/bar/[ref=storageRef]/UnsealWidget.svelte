<script lang="ts">
    import { untrack } from "svelte";
    import * as m from "$lib/paraglide/messages.js";
    import type { OfflineBar } from "$lib/offline/store.svelte";
    import { servingPreset } from "$lib/bar/servings";
    import { measureLabel } from "$lib/bar/quantity";

    /**
     * Records a package being opened, so stock counts down from something real.
     *
     * `lockedItemKey` is what the stock board opens it with: the barman got here by
     * tapping one card, so re-picking the item from a list of everything the bar sells
     * would only be a chance to pick the wrong one.
     *
     * `clientId` is set when the unseal answers a spigot: every staff kiosk listening asks,
     * and whichever of them fill it in still land one package. `initialQuantity` is only
     * a suggestion — the previous package's size, for the barman to keep or overwrite.
     */
    let {
        bar,
        lockedItemKey,
        clientId,
        initialQuantity,
        onDone,
    }: {
        bar: OfflineBar;
        lockedItemKey?: string;
        clientId?: string;
        initialQuantity?: number;
        onDone?: () => void;
    } = $props();
    const store = bar;

    let pickedKey = $state("");
    // Read once: a suggestion seeds the field, it does not chase the prop afterwards.
    let quantity = $state(untrack(() => (initialQuantity ? String(initialQuantity) : "")));

    const itemKey = $derived(lockedItemKey ?? pickedKey);
    const item = $derived(store.offerItems.find((offer) => offer.key === itemKey));

    // Litres from a tap, pieces out of a box — the item decides how its package counts.
    // Null until one is picked, which is also what gates the input: its label is the unit.
    const measure = $derived(item ? servingPreset(item).measure : null);

    async function submit(e: SubmitEvent) {
        e.preventDefault();
        if (!item) return;

        await store.process("unseal", {
            clientId,
            offerItemKey: item.key,
            offerItemName: item.name,
            quantity: parseFloat(quantity) || 0,
        });

        pickedKey = "";
        quantity = "";
        onDone?.();
    }
</script>

<form class="inline-form" onsubmit={submit}>
    <label>
        {m["baroo.staff.unseal_item"]()}
        {#if lockedItemKey}
            <output class="form-control-plaintext locked-item">{item?.name ?? lockedItemKey}</output>
        {:else}
            <select class="form-select" bind:value={pickedKey} required>
                <option value="" disabled>—</option>
                {#each store.offerItems as offer (offer.key)}
                    <option value={offer.key}>{offer.name}</option>
                {/each}
            </select>
        {/if}
    </label>

    {#if measure}
        <label>
            {m["baroo.staff.unseal_quantity"]({ measure: measureLabel(measure) })}
            <!-- svelte-ignore a11y_autofocus -->
            <input
                class="form-control"
                type="number"
                inputmode={measure === "count" ? "numeric" : "decimal"}
                min="0"
                step={measure === "count" ? 1 : 0.1}
                autofocus={!!lockedItemKey}
                onfocus={(e) => e.currentTarget.select()}
                bind:value={quantity}
                required
            />
        </label>
    {/if}

    <button class="btn btn-primary" type="submit" disabled={!itemKey}>
        {m["baroo.staff.unseal_submit"]()}
    </button>
</form>

<style lang="scss">
    // The item is settled; it reads as the answer it is rather than as a dead input.
    .locked-item {
        font-weight: 600;
        padding-block: 0;
    }
</style>
