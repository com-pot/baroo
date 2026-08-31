<script lang="ts">
    import * as m from "$lib/paraglide/messages.js";
    import type { OfflineBar } from "$lib/offline/store.svelte";
    import { servingPreset } from "$lib/bar/servings";
    import { measureLabel } from "$lib/bar/quantity";

    /**
     * Records a package being opened, so stock counts down from something real.
     */
    let { bar }: { bar: OfflineBar } = $props();
    const store = bar;

    let itemKey = $state("");
    let quantity = $state("");

    const item = $derived(store.offerItems.find((offer) => offer.key === itemKey));

    // Litres from a tap, pieces out of a box — the item decides how its package counts.
    // Null until one is picked, which is also what gates the input: its label is the unit.
    const measure = $derived(item ? servingPreset(item).measure : null);

    async function submit(e: SubmitEvent) {
        e.preventDefault();
        if (!item) return;

        await store.process("unseal", {
            offerItemKey: item.key,
            offerItemName: item.name,
            quantity: parseFloat(quantity) || 0,
        });

        itemKey = "";
        quantity = "";
    }
</script>

<form class="inline-form" onsubmit={submit}>
    <label>
        {m["baroo.staff.unseal_item"]()}
        <select class="form-select" bind:value={itemKey} required>
            <option value="" disabled>—</option>
            {#each store.offerItems as offer (offer.key)}
                <option value={offer.key}>{offer.name}</option>
            {/each}
        </select>
    </label>

    {#if measure}
        <label>
            {m["baroo.staff.unseal_quantity"]({ measure: measureLabel(measure) })}
            <input
                class="form-control"
                type="number"
                inputmode={measure === "count" ? "numeric" : "decimal"}
                min="0"
                step={measure === "count" ? 1 : 0.1}
                bind:value={quantity}
                required
            />
        </label>
    {/if}

    <button class="btn btn-primary" type="submit" disabled={!itemKey}>
        {m["baroo.staff.unseal_submit"]()}
    </button>
</form>
