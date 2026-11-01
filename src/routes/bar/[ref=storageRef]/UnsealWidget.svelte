<script lang="ts">
    import { untrack } from "svelte";
    import * as m from "$lib/paraglide/messages.js";
    import type { BarOfflineStore } from "$lib/offline/store.svelte";
    import { servingPreset } from "$lib/bar/servings";
    import { formatQuantity, measureLabel, packageLabel } from "$lib/bar/quantity";
    import TapPicker from "./TapPicker.svelte";

    let {
        store,
        lockedItemKey,
        tap: preselectedTap,
        taps,
        onDone,
    }: {
        store: Pick<BarOfflineStore, "barOffer" | "process" | "offerItems" | "packages" | "stock">;
        lockedItemKey?: string;
        /** The tap to unseal onto, the item's own one otherwise */
        tap?: string;
        /** Taps to pick from, with what is on them */
        taps: { tap: string, offerItemKey: string | null }[];
        onDone?: () => void;
    } = $props();

    let pickedKey = $state("");

    const itemKey = $derived(lockedItemKey ?? pickedKey);
    const item = $derived(store.barOffer[itemKey]);
    const stock = $derived(store.stock.find((entry) => entry.item.key === itemKey));
    const packages = $derived(store.packages.filter((offerPackage) => offerPackage.offerItemKey === itemKey));

    const measure = $derived(item ? servingPreset(item.servingPreset).measure : null);

    let packageId = $state("");
    let quantity = $state("");
    let tap = $state("");
    let flushCurrent = $state(true);

    /** An item's own guesses: the package kind it had last, the tap it is on */
    function guessFor(key: string) {
        const entry = store.stock.find((candidate) => candidate.item.key === key);
        const own = store.packages.filter((offerPackage) => offerPackage.offerItemKey === key);
        const usual = own.find((offerPackage) => offerPackage.id === entry?.packageId) ?? own[0];

        packageId = usual?.id ?? "";
        quantity = usual
            ? String(usual.quantity)
            : entry?.unsealedAt && entry.unsealQuantity > 0 ? String(entry.unsealQuantity) : "";
        tap = preselectedTap ?? entry?.taps[0] ?? "";
        flushCurrent = true;
    }
    untrack(() => guessFor(itemKey));

    function pickItem(e: Event & { currentTarget: HTMLSelectElement }) {
        pickedKey = e.currentTarget.value;
        guessFor(pickedKey);
    }

    function pickPackage(e: Event & { currentTarget: HTMLSelectElement }) {
        packageId = e.currentTarget.value;
        const picked = packages.find((offerPackage) => offerPackage.id === packageId);
        if (picked) quantity = String(picked.quantity);
    }

    async function submit(e: SubmitEvent) {
        e.preventDefault();
        if (!item) return;

        await store.process("unseal", {
            offerItemKey: item.key,
            offerItemName: item.name,
            quantity: parseFloat(quantity) || 0,
            tap: tap || null,
            packageId: packageId || null,
            // Stock opened on another device meanwhile is no reason to keep it
            flushCurrent: stock?.unsealedAt ? flushCurrent : true,
        });

        pickedKey = "";
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
                value={pickedKey} onchange={pickItem} required
            >
                <option value="" disabled>—</option>
                {#each store.offerItems as offer (offer.key)}
                    <option value={offer.key}>{offer.name}</option>
                {/each}
            </select>
        {/if}
    </div>

    {#if measure && packages.length}
        <div class="input-pair">
            <label for="unseal.package">{m["baroo.staff.unseal_package"]()}</label>
            <select class="form-select" id="unseal.package" value={packageId} onchange={pickPackage}>
                <option value="">{m["baroo.staff.unseal_package_custom"]()}</option>
                {#each packages as offerPackage (offerPackage.id)}
                    <option value={offerPackage.id}>{packageLabel(offerPackage, measure)}</option>
                {/each}
            </select>
        </div>
    {/if}

    <div class="input-pair">
        <label for="unseal.quantity">{m["baroo.staff.unseal_quantity"]({ measure: measure ? measureLabel(measure) : "..." })}</label>
        <input
            id="unseal.quantity" class="form-control"
            type="number"
            inputmode={measure === "volume" ? "decimal" : "numeric"}
            min={measure === "volume" ? 0.1 : 1}
            step={measure === "volume" ? 0.1 : 1}
            onfocus={(e) => e.currentTarget.select()}
            bind:value={quantity}
            required
        />
    </div>

    <div class="input-pair">
        <label for="unseal.tap">{m["baroo.staff.unseal_tap"]()}</label>
        {#key itemKey}
            <TapPicker id="unseal.tap" {taps} offerItems={store.offerItems} bind:value={tap} />
        {/key}
    </div>

    {#if stock?.unsealedAt}
        <div class="form-check">
            <input class="form-check-input" type="checkbox" id="unseal.flushCurrent" bind:checked={flushCurrent} />
            <label class="form-check-label" for="unseal.flushCurrent">
                {m["baroo.staff.unseal_flush_current"]()}
                <small>
                    {flushCurrent
                        ? m["baroo.staff.unseal_flush_current_hint"]({ left: formatQuantity(stock.measure, stock.left ?? 0) })
                        : m["baroo.staff.unseal_top_up_hint"]()}
                </small>
            </label>
        </div>
    {/if}

    <button class="btn btn-primary" type="submit" disabled={!itemKey}>
        {m["baroo.staff.unseal_submit"]()}
    </button>
</form>
