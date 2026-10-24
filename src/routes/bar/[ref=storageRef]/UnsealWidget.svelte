<script lang="ts">
    import * as m from "$lib/paraglide/messages.js";
    import type { BarOfflineStore } from "$lib/offline/store.svelte";
    import { servingPreset } from "$lib/bar/servings";
    import { measureLabel } from "$lib/bar/quantity";

    let {
        store,
        lockedItemKey,
        onDone,
    }: {
        store: BarOfflineStore;
        lockedItemKey?: string;
        onDone?: () => void;
    } = $props();

    let pickedKey = $state("");
    let quantity = $state("");

    const itemKey = $derived(lockedItemKey ?? pickedKey);
    const item = $derived(store.barOffer[itemKey]);

    const measure = $derived(item ? servingPreset(item.servingPreset).measure : null);

    async function submit(e: SubmitEvent) {
        e.preventDefault();
        if (!item) return;

        await store.process("unseal", {
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

<style lang="scss">
    .locked-item {
        font-weight: 600;
        padding-block: 0;
    }
</style>
