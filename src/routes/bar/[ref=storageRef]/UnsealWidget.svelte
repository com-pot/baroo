<script lang="ts">
    import { untrack } from "svelte";
    import * as m from "$lib/paraglide/messages.js";
    import type { BarOfflineStore } from "$lib/offline/store.svelte";
    import { servingPreset } from "$lib/bar/servings";
    import { measureLabel } from "$lib/bar/quantity";

    let {
        store,
        lockedItemKey,
        clientId,
        initialQuantity,
        onDone,
    }: {
        store: Pick<BarOfflineStore, "barSlug" | "barOffer" | "process" | "offerItems">;
        lockedItemKey?: string;
        /** Set by a spigot, so staff kiosks answering the same scan land one unseal */
        clientId?: string;
        initialQuantity?: number;
        onDone?: () => void;
    } = $props();

    let pickedKey = $state("");
    let quantity = $state(untrack(() => (initialQuantity ? String(initialQuantity) : "")));

    const itemKey = $derived(lockedItemKey ?? pickedKey);
    const item = $derived(store.barOffer[itemKey]);

    const measure = $derived(item ? servingPreset(item.servingPreset).measure : null);

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
    <div class="input-pair">
        <label for="unseal.itemKey">{m["baroo.staff.unseal_item"]()}</label>
        {#if lockedItemKey}
            <output id="unseal.itemKey" class="form-control-plaintext">{item?.name ?? lockedItemKey}</output>
        {:else}
            <select class="form-select" id="unseal.itemKey"
                bind:value={pickedKey} required
            >
                <option value="" disabled>—</option>
                {#each store.offerItems as offer (offer.key)}
                    <option value={offer.key}>{offer.name}</option>
                {/each}
            </select>
        {/if}
    </div>

    <div class="input-pair">
        <label for="unseal.quantity">{m["baroo.staff.unseal_quantity"]({ measure: measure ? measureLabel(measure) : "..." })}</label>
        <input
            id="unseal.quantity" class="form-control"
            type="number"
            inputmode={measure === "volume" ? "decimal" : "numeric"}
            min="0"
            step={measure === "volume" ? 0.1 : 1}
            onfocus={(e) => e.currentTarget.select()}
            bind:value={quantity}
            required
        />
    </div>

    <button class="btn btn-primary" type="submit" disabled={!itemKey}>
        {m["baroo.staff.unseal_submit"]()}
    </button>
</form>

